import { env } from "../shared/env.js";
import { executeResponseSchema } from "../shared/bidProtocol.js";
import { scoreComplexity } from "../shared/complexity.js";
import { estimateOutputTokens, estimateTokens } from "../shared/pricing.js";
import type { MemoPayload, ProviderId, SettlementRecord, Task, TaskResult } from "../shared/types.js";
import { broadcastQuotes } from "./bidBroadcaster.js";
import { decide } from "./decisionEngine.js";
import { publish } from "./eventBus.js";
import { providerBaseUrl } from "./providerRegistry.js";
import { isPaused, applySpend, wouldExceedCap } from "./safeguards/spendCap.js";
import { getSession, recordSettlement } from "./sessionStore.js";
import { settleViaChannel, usdToDrops } from "./xrpl/paymentChannel.js";
import { settleViaPayment } from "./xrpl/paymentFallback.js";
import { loadAgentWallets } from "./xrpl/wallets.js";

async function executeOnWinner(providerId: ProviderId, taskId: string, quoteId: string, prompt: string) {
  const response = await fetch(`${providerBaseUrl(providerId)}/execute`, {
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
  const session = getSession(task.sessionId);
  if (!session) {
    publish({ type: "task.failed", sessionId: task.sessionId, taskId: task.taskId, reason: "unknown session" });
    return null;
  }

  if (isPaused(session)) {
    publish({ type: "task.rejected", sessionId: task.sessionId, taskId: task.taskId, reason: "session is paused on spend cap — resume before submitting more tasks" });
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
    publish({ type: "task.failed", sessionId: task.sessionId, taskId: task.taskId, reason: "no provider responded to the bid round" });
    return null;
  }

  const decision = decide(bids, complexityScore, budgetRemainingUsd);
  if (!decision || decision.rejectedForBudget.length === bids.length) {
    publish({ type: "task.rejected", sessionId: task.sessionId, taskId: task.taskId, reason: "every bid exceeded the remaining budget — raise the budget and retry" });
    return null;
  }

  publish({ type: "decision.made", sessionId: task.sessionId, taskId: task.taskId, decision });

  const winner = decision.winner;
  publish({ type: "settlement.started", sessionId: task.sessionId, taskId: task.taskId, providerId: winner.providerId });

  const execution = await executeOnWinner(winner.providerId, task.taskId, winner.quoteId, task.prompt);

  // Settlement uses the originally quoted cost — what was literally bid and
  // memo'd — not the actual usage, so the on-chain record always matches the
  // auction decision it's justifying. See docs/architecture.md.
  const settlementAmountUsd = winner.estimatedTotalCostUsd;

  if (wouldExceedCap(session, settlementAmountUsd)) {
    session.status = "paused";
    publish({ type: "session.paused", sessionId: task.sessionId, session });
    publish({ type: "task.rejected", sessionId: task.sessionId, taskId: task.taskId, reason: "settlement would exceed the session spend cap — session paused, resume to continue" });
    return null;
  }

  const memo: MemoPayload = {
    providerId: winner.providerId,
    bidPricePerInputTokenUsd: winner.pricePerInputTokenUsd,
    bidPricePerOutputTokenUsd: winner.pricePerOutputTokenUsd,
    bidTotalCostUsd: winner.estimatedTotalCostUsd,
    qualityScore: winner.qualityScore,
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
        mode: "channel",
        txHash: result.txHash,
        amountDrops: result.amountDrops,
        amountUsd: settlementAmountUsd,
        memo,
        explorerUrl: result.explorerUrl,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      publish({ type: "settlement.fallback", sessionId: task.sessionId, taskId: task.taskId, reason });
      const result = await settleViaPayment(winner.providerId, amountDrops, memo, wallets);
      settlement = {
        taskId: task.taskId,
        providerId: winner.providerId,
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
      mode: "payment",
      txHash: result.txHash,
      amountDrops: result.amountDrops,
      amountUsd: settlementAmountUsd,
      memo,
      explorerUrl: result.explorerUrl,
    };
  }

  applySpend(session, settlementAmountUsd);
  recordSettlement(task.sessionId, settlement);
  publish({ type: "settlement.confirmed", sessionId: task.sessionId, taskId: task.taskId, settlement });

  if (session.status === "warning") publish({ type: "session.warning", sessionId: task.sessionId, session });
  if (session.status === "paused") publish({ type: "session.paused", sessionId: task.sessionId, session });

  publish({ type: "task.completed", sessionId: task.sessionId, taskId: task.taskId, output: execution.output });

  return {
    taskId: task.taskId,
    output: execution.output,
    actualInputTokens: execution.actualInputTokens,
    actualOutputTokens: execution.actualOutputTokens,
    actualCostUsd: execution.actualCostUsd,
  };
}
