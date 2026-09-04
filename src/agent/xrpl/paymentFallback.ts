import type { Payment } from "xrpl";
import { buildMemoHex } from "../../shared/memo.js";
import type { MemoPayload, ProviderId } from "../../shared/types.js";
import { getXrplClient } from "./client.js";
import type { AgentWallets } from "./wallets.js";

const XRPL_AI_STARTER_KIT_SOURCE_TAG = 20260530;

export interface FallbackSettlementResult {
  txHash: string;
  explorerUrl: string;
  amountDrops: string;
}

/**
 * Discrete Payment-per-task settlement. Used when SETTLEMENT_MODE=payment,
 * or automatically when any Payment Channel operation throws — see
 * orchestrator.ts. Same audit memo as the channel path, so every settlement
 * is self-justifying regardless of which rail carried it.
 */
export async function settleViaPayment(
  providerId: ProviderId,
  amountDrops: bigint,
  memo: MemoPayload,
  wallets: AgentWallets,
): Promise<FallbackSettlementResult> {
  const client = await getXrplClient();
  const providerWallet = wallets.providers[providerId];

  const tx: Payment = {
    TransactionType: "Payment",
    Account: wallets.agent.classicAddress,
    Destination: providerWallet.classicAddress,
    Amount: amountDrops.toString(),
    SourceTag: XRPL_AI_STARTER_KIT_SOURCE_TAG,
    Memos: buildMemoHex(memo),
  };

  const prepared = await client.autofill(tx);
  const signed = wallets.agent.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  const txResult = result.result.meta && typeof result.result.meta === "object" ? (result.result.meta as { TransactionResult?: string }).TransactionResult : undefined;
  if (txResult !== "tesSUCCESS") {
    throw new Error(`Fallback Payment to ${providerId} failed: ${txResult ?? "unknown result"}`);
  }

  return {
    txHash: signed.hash,
    explorerUrl: `https://testnet.xrpl.org/transactions/${signed.hash}`,
    amountDrops: amountDrops.toString(),
  };
}
