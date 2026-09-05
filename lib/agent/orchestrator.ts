import { env } from "../shared/env";
import { executeResponseSchema } from "../shared/bidProtocol";
import { scoreComplexity } from "../shared/complexity";
import { estimateOutputTokens, estimateTokens } from "../shared/pricing";
import type { MemoPayload, ProviderId, SettlementRecord, Task, TaskResult } from "../shared/types";
import { recordOutcome } from "../store/agentStatsStore";
import { publish } from "../store/eventBus";
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

export async function runTask(task: Task): Promise<TaskResult | null> {
  const session = await getSession(task.sessionId);
  if (!session) {
    await publish({ type: "task.failed", sessionId: task.sessionId, taskId: task.taskId, reason: "unknown session" });
    return null;
  }

  if (isPaused(session)) {
    await publish({
      type: "task.rejected",
      sessionId: task.sessionId,
      taskId: task.taskId,
      reason: "Session is paused at the spend cap. Resume it before submitting more tasks.",
    });
    return null;
  }

  const complexityScore = scoreComplexity(task.prompt, task.complexityHint);
  const estimatedInputTokens = estimateTokens(task.prompt);
  const estimatedOutputTokens = estimateOutputTokens(complexityScore);
  const budgetRemainingUsd = Math.max(0, Math.min(task.budgetUsd, session.capUsd - session.spentUsd));

  const { bids } = await broadcastQuotes(task.sessionId, task.taskId, {
    taskId: task.taskId,
    sessionId: task.sessionId,
    promptPreview: task.prompt.slice(0, 200),
    estimatedInputTokens,
    estimatedOutputTokens,
    complexityScore,
    budgetRemainingUsd,
  });

  if (bids.length === 0) {
    await publish({ type: "task.failed", sessionId: task.sessionId, taskId: task.taskId, reason: "no provider responded to the bid round" });
    return null;
  }

  const decision = await decide(bids, budgetRemainingUsd, task.prompt.slice(0, 300));
  if (!decision || decision.rejectedForBudget.length === bids.length) {
    await publish({
      type: "task.rejected",
      sessionId: task.sessionId,
      taskId: task.taskId,
      reason: "Every bid came in above the remaining budget. Raise the budget and try again.",
    });
    return null;
  }

  await publish({ type: "decision.made", sessionId: task.sessionId, taskId: task.taskId, decision });

  const winner = decision.winner;
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

  // Settlement uses the originally quoted cost — what was literally bid and
  // memo'd — not the actual usage, so the on-chain record always matches the
  // auction decision it's justifying. See docs/architecture.md.
  const settlementAmountUsd = winner.estimatedTotalCostUsd;

  if (wouldExceedCap(session, settlementAmountUsd)) {
    session.status = "paused";
    await saveSession(session);
    await publish({ type: "session.paused", sessionId: task.sessionId, session });
    await publish({
      type: "task.rejected",
      sessionId: task.sessionId,
      taskId: task.taskId,
      reason: "Settling this task would go over the session spend cap, so the session is paused. Resume it to continue.",
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

  applySpend(session, settlementAmountUsd);
  await saveSession(session);
  await recordSettlement(task.sessionId, settlement);
  await publish({ type: "settlement.confirmed", sessionId: task.sessionId, taskId: task.taskId, settlement });

  if (session.status === "warning") await publish({ type: "session.warning", sessionId: task.sessionId, session });
  if (session.status === "paused") await publish({ type: "session.paused", sessionId: task.sessionId, session });

  await publish({ type: "task.completed", sessionId: task.sessionId, taskId: task.taskId, output: execution.output });

  return {
    taskId: task.taskId,
    output: execution.output,
    actualInputTokens: execution.actualInputTokens,
    actualOutputTokens: execution.actualOutputTokens,
    actualCostUsd: execution.actualCostUsd,
  };
}
