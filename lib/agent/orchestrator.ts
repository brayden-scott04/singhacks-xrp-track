import { env } from "../shared/env";
import { executeResponseSchema } from "../shared/bidProtocol";
import { scoreComplexity } from "../shared/complexity";
import type { HistoryBidSnapshot, TaskHistoryInput } from "../shared/historyTypes";
import { estimateOutputTokens, estimateTokens } from "../shared/pricing";
import type { DecisionResult, IndustryBid, MemoPayload, ProviderId, SettlementRecord, Task, TaskResult } from "../shared/types";
import { recordOutcome } from "../store/agentStatsStore";
import { publish } from "../store/eventBus";
import { historyStore } from "../store/historyStore";
import { getSession, recordSettlement, saveSession } from "../store/sessionStore";
import { settleViaChannel, usdToDrops } from "../xrpl/paymentChannel";
import { settleViaPayment } from "../xrpl/paymentFallback";
import { loadAgentWallets } from "../xrpl/wallets";
import { broadcastQuotes } from "./bidBroadcaster";
import { decide } from "./decisionEngine";
import { providerUrl } from "./providerRegistry";
import { applySpend, isPaused, wouldExceedCap } from "./safeguards/spendCap";

async function executeOnWinner(providerId: ProviderId, taskId: string, quoteId: string, prompt: string) {
  const response = await fetch(providerUrl(providerId, "execute"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, quoteId, prompt }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`execute failed on ${providerId} (${response.status}): ${body}`);
  }
  return executeResponseSchema.parse(await response.json());
}

/** The literal prefix decisionEngine.ts's LLM-chosen reason string always starts with, see decide(). */
const DECISION_AGENT_PREFIX = "Decision agent (";

function baseHistoryDraft(task: Task, status: TaskHistoryInput["status"], failureReason: string | null): TaskHistoryInput {
  return {
    taskId: task.taskId,
    sessionId: task.sessionId,
    createdAt: task.createdAt,
    prompt: task.prompt,
    complexityHint: task.complexityHint,
    budgetUsd: task.budgetUsd,
    status,
    failureReason,
    complexityScore: null,
    winnerIndustryId: null,
    winnerProviderId: null,
    winnerModelId: null,
    decisionReason: null,
    decidedByLlm: null,
    bids: [],
    excludedBids: [],
    estimatedCostUsd: null,
    actualCostUsd: null,
    actualInputTokens: null,
    actualOutputTokens: null,
    settlementMode: null,
    txHash: null,
    amountDrops: null,
    amountUsd: null,
    explorerUrl: null,
    fallbackReason: null,
    output: null,
  };
}

function toBidSnapshot(bid: IndustryBid, isWinner: boolean): HistoryBidSnapshot {
  return { bid, factorScores: null, compositeScore: null, budgetFit: null, isWinner };
}

/** Snapshots every ranked candidate — the full bid plus its own factor scores — tagging the winner. */
function snapshotRankedBids(decision: DecisionResult): HistoryBidSnapshot[] {
  return decision.ranked.map((r) => ({
    bid: r.bid,
    factorScores: r.bid.factorScores,
    compositeScore: r.bid.compositeScore,
    budgetFit: r.budgetFit,
    isWinner: r.bid.industryId === decision.winner.industryId,
  }));
}

export async function runTask(task: Task): Promise<TaskResult | null> {
  const session = await getSession(task.sessionId);
  if (!session) {
    await publish({ type: "task.failed", sessionId: task.sessionId, taskId: task.taskId, reason: "unknown session" });
    historyStore.recordTaskHistory(baseHistoryDraft(task, "failed", "unknown session"));
    return null;
  }

  if (isPaused(session)) {
    const reason = "Session is paused at the spend cap. Resume it before submitting more tasks.";
    await publish({ type: "task.rejected", sessionId: task.sessionId, taskId: task.taskId, reason });
    historyStore.recordTaskHistory(baseHistoryDraft(task, "rejected", reason));
    return null;
  }

  // Accumulates as the task progresses; recorded exactly once, either at one
  // of the explicit exit points below or — for anything that throws instead
  // of returning cleanly (a failed /execute call, or a channel AND fallback
  // settlement both failing) — in the catch block, with whatever context had
  // already been learned by that point. This is what makes failures show up
  // in history with the same bid/decision detail as a successful settlement.
  const draft = baseHistoryDraft(task, "failed", "task did not complete");

  try {
    const complexityScore = scoreComplexity(task.prompt, task.complexityHint);
    draft.complexityScore = complexityScore;
    const estimatedInputTokens = estimateTokens(task.prompt);
    const estimatedOutputTokens = estimateOutputTokens(complexityScore);
    const budgetRemainingUsd = Math.max(0, Math.min(task.budgetUsd, session.capUsd - session.spentUsd));

    const { bids, excluded } = await broadcastQuotes(task.sessionId, task.taskId, {
      taskId: task.taskId,
      sessionId: task.sessionId,
      promptPreview: task.prompt.slice(0, 200),
      estimatedInputTokens,
      estimatedOutputTokens,
      complexityScore,
      budgetRemainingUsd,
    });
    draft.excludedBids = excluded;

    if (bids.length === 0) {
      draft.status = "failed";
      draft.failureReason = "no provider responded to the bid round";
      historyStore.recordTaskHistory(draft);
      await publish({ type: "task.failed", sessionId: task.sessionId, taskId: task.taskId, reason: draft.failureReason });
      return null;
    }
    draft.bids = bids.map((b) => toBidSnapshot(b, false));

    const decision = await decide(bids, budgetRemainingUsd, task.prompt.slice(0, 300));
    if (decision) {
      draft.decisionReason = decision.reason;
      draft.bids = snapshotRankedBids(decision);
    }

    if (!decision || decision.rejectedForBudget.length === bids.length) {
      draft.status = "rejected";
      draft.failureReason = "Every bid came in above the remaining budget. Raise the budget and try again.";
      historyStore.recordTaskHistory(draft);
      await publish({ type: "task.rejected", sessionId: task.sessionId, taskId: task.taskId, reason: draft.failureReason });
      return null;
    }

    await publish({ type: "decision.made", sessionId: task.sessionId, taskId: task.taskId, decision });

    const winner = decision.winner;
    draft.winnerIndustryId = winner.industryId;
    draft.winnerProviderId = winner.providerId;
    draft.winnerModelId = winner.modelId;
    draft.decidedByLlm = decision.reason.startsWith(DECISION_AGENT_PREFIX);
    draft.estimatedCostUsd = winner.estimatedTotalCostUsd;

    await publish({
      type: "settlement.started",
      sessionId: task.sessionId,
      taskId: task.taskId,
      providerId: winner.providerId,
      industryId: winner.industryId,
    });

    let execution;
    try {
      execution = await executeOnWinner(winner.providerId, task.taskId, winner.quoteId, task.prompt);
      recordOutcome(winner.industryId, true);
    } catch (err) {
      recordOutcome(winner.industryId, false);
      throw err;
    }
    draft.actualInputTokens = execution.actualInputTokens;
    draft.actualOutputTokens = execution.actualOutputTokens;
    draft.actualCostUsd = execution.actualCostUsd;
    draft.output = execution.output;

    // Settlement uses the originally quoted cost — what was literally bid and
    // memo'd — not the actual usage, so the on-chain record always matches the
    // auction decision it's justifying. See docs/architecture.md.
    const settlementAmountUsd = winner.estimatedTotalCostUsd;

    if (wouldExceedCap(session, settlementAmountUsd)) {
      session.status = "paused";
      await saveSession(session);
      await publish({ type: "session.paused", sessionId: task.sessionId, session });
      draft.status = "rejected";
      draft.failureReason = "Settling this task would go over the session spend cap, so the session is paused. Resume it to continue.";
      historyStore.recordTaskHistory(draft);
      await publish({
        type: "task.rejected",
        sessionId: task.sessionId,
        taskId: task.taskId,
        reason: draft.failureReason,
      });
      return null;
    }

    const memo: MemoPayload = {
      providerId: winner.providerId,
      industryId: winner.industryId,
      bidPricePerInputTokenUsd: winner.pricePerInputTokenUsd,
      bidPricePerOutputTokenUsd: winner.pricePerOutputTokenUsd,
      bidTotalCostUsd: winner.estimatedTotalCostUsd,
      qualityScore: winner.qualityScore,
      factorScores: winner.factorScores,
      compositeScore: winner.compositeScore,
      taskComplexityScore: complexityScore,
      taskId: task.taskId,
      winningReason: decision.reason,
    };

    const wallets = loadAgentWallets();
    const amountDrops = BigInt(usdToDrops(settlementAmountUsd, env.XRP_USD_RATE));
    const channelCeilingDrops = usdToDrops(session.capUsd * 2, env.XRP_USD_RATE);

    let settlement: SettlementRecord;

    if (env.SETTLEMENT_MODE === "channel") {
      try {
        const result = await settleViaChannel(winner.providerId, amountDrops, memo, wallets, channelCeilingDrops);
        settlement = {
          taskId: task.taskId,
          providerId: winner.providerId,
          industryId: winner.industryId,
          mode: "channel",
          txHash: result.txHash,
          amountDrops: result.amountDrops,
          amountUsd: settlementAmountUsd,
          memo,
          explorerUrl: result.explorerUrl,
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        draft.fallbackReason = reason;
        await publish({ type: "settlement.fallback", sessionId: task.sessionId, taskId: task.taskId, reason });
        const result = await settleViaPayment(winner.providerId, amountDrops, memo, wallets);
        settlement = {
          taskId: task.taskId,
          providerId: winner.providerId,
          industryId: winner.industryId,
          mode: "payment",
          txHash: result.txHash,
          amountDrops: result.amountDrops,
          amountUsd: settlementAmountUsd,
          memo,
          explorerUrl: result.explorerUrl,
          fallbackReason: reason,
        };
      }
    } else {
      const result = await settleViaPayment(winner.providerId, amountDrops, memo, wallets);
      settlement = {
        taskId: task.taskId,
        providerId: winner.providerId,
        industryId: winner.industryId,
        mode: "payment",
        txHash: result.txHash,
        amountDrops: result.amountDrops,
        amountUsd: settlementAmountUsd,
        memo,
        explorerUrl: result.explorerUrl,
      };
    }

    draft.settlementMode = settlement.mode;
    draft.txHash = settlement.txHash;
    draft.amountDrops = settlement.amountDrops;
    draft.amountUsd = settlement.amountUsd;
    draft.explorerUrl = settlement.explorerUrl;

    applySpend(session, settlementAmountUsd);
    await saveSession(session);
    await recordSettlement(task.sessionId, settlement);
    await publish({ type: "settlement.confirmed", sessionId: task.sessionId, taskId: task.taskId, settlement });

    if (session.status === "warning") await publish({ type: "session.warning", sessionId: task.sessionId, session });
    if (session.status === "paused") await publish({ type: "session.paused", sessionId: task.sessionId, session });

    await publish({ type: "task.completed", sessionId: task.sessionId, taskId: task.taskId, output: execution.output });

    draft.status = "completed";
    draft.failureReason = null;
    historyStore.recordTaskHistory(draft);

    return {
      taskId: task.taskId,
      output: execution.output,
      actualInputTokens: execution.actualInputTokens,
      actualOutputTokens: execution.actualOutputTokens,
      actualCostUsd: execution.actualCostUsd,
    };
  } catch (err) {
    draft.status = "failed";
    draft.failureReason = err instanceof Error ? err.message : String(err);
    historyStore.recordTaskHistory(draft);
    throw err;
  }
}
