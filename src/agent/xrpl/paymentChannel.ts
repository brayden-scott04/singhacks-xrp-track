import { xrpToDrops, type PaymentChannelClaim, type PaymentChannelCreate, type Wallet } from "xrpl";
import { buildMemoHex } from "../../shared/memo.js";
import type { MemoPayload, ProviderId } from "../../shared/types.js";
import { getXrplClient } from "./client.js";
import { signChannelClaim, verifyChannelClaim } from "./channelClaimCodec.js";
import type { AgentWallets } from "./wallets.js";

const XRPL_AI_STARTER_KIT_SOURCE_TAG = 20260530;
const SETTLE_DELAY_SECONDS = 60;

interface ChannelState {
  channelId: string;
  cumulativeDrops: bigint;
}

// One active session at a time for this hackathon build — see docs/architecture.md.
const channels = new Map<ProviderId, ChannelState>();

function explorerUrl(txHash: string): string {
  return `https://testnet.xrpl.org/transactions/${txHash}`;
}

function extractChannelId(meta: unknown): string | null {
  const affectedNodes = (meta as { AffectedNodes?: unknown[] })?.AffectedNodes ?? [];
  for (const node of affectedNodes) {
    const created = (node as { CreatedNode?: { LedgerEntryType?: string; LedgerIndex?: string } }).CreatedNode;
    if (created?.LedgerEntryType === "PayChannel" && created.LedgerIndex) {
      return created.LedgerIndex;
    }
  }
  return null;
}

/** Opens a Payment Channel from the agent to one provider, if not already open this session. */
export async function ensureChannelOpen(
  providerId: ProviderId,
  wallets: AgentWallets,
  ceilingDrops: string,
): Promise<ChannelState> {
  const existing = channels.get(providerId);
  if (existing) return existing;

  const client = await getXrplClient();
  const providerWallet = wallets.providers[providerId];

  const tx: PaymentChannelCreate = {
    TransactionType: "PaymentChannelCreate",
    Account: wallets.agent.classicAddress,
    Destination: providerWallet.classicAddress,
    Amount: ceilingDrops,
    SettleDelay: SETTLE_DELAY_SECONDS,
    PublicKey: wallets.agent.publicKey,
    SourceTag: XRPL_AI_STARTER_KIT_SOURCE_TAG,
  };

  const prepared = await client.autofill(tx);
  const signed = wallets.agent.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  const txResult = result.result.meta && typeof result.result.meta === "object" ? (result.result.meta as { TransactionResult?: string }).TransactionResult : undefined;
  if (txResult !== "tesSUCCESS") {
    throw new Error(`PaymentChannelCreate to ${providerId} failed: ${txResult ?? "unknown result"}`);
  }

  const channelId = extractChannelId(result.result.meta);
  if (!channelId) {
    throw new Error(`PaymentChannelCreate to ${providerId} succeeded but no PayChannel node was found in metadata`);
  }

  console.log(`[xrpl] opened channel to ${providerId}: ${channelId} (tx ${signed.hash})`);
  const state: ChannelState = { channelId, cumulativeDrops: 0n };
  channels.set(providerId, state);
  return state;
}

export interface ChannelSettlementResult {
  txHash: string;
  explorerUrl: string;
  amountDrops: string;
  channelId: string;
}

/**
 * Signs an off-chain cumulative claim for this task's cost, verifies it
 * locally, then settles it on-ledger immediately via PaymentChannelClaim
 * (not batched — every task gets its own inspectable tx + memo, see
 * docs/architecture.md for the batching trade-off this makes explicit).
 */
export async function settleViaChannel(
  providerId: ProviderId,
  taskCostDrops: bigint,
  memo: MemoPayload,
  wallets: AgentWallets,
  ceilingDrops: string,
): Promise<ChannelSettlementResult> {
  const state = await ensureChannelOpen(providerId, wallets, ceilingDrops);
  const newCumulative = state.cumulativeDrops + taskCostDrops;
  const cumulativeStr = newCumulative.toString();

  const signature = signChannelClaim(state.channelId, cumulativeStr, wallets.agent.privateKey);
  const verified = verifyChannelClaim(state.channelId, cumulativeStr, signature, wallets.agent.publicKey);
  if (!verified) {
    throw new Error(`Off-chain claim signature failed local verification for channel ${state.channelId} — refusing to settle`);
  }

  const client = await getXrplClient();
  const providerWallet = wallets.providers[providerId];

  const tx: PaymentChannelClaim = {
    TransactionType: "PaymentChannelClaim",
    Account: providerWallet.classicAddress,
    Channel: state.channelId,
    Balance: cumulativeStr,
    Amount: cumulativeStr,
    Signature: signature,
    PublicKey: wallets.agent.publicKey,
    SourceTag: XRPL_AI_STARTER_KIT_SOURCE_TAG,
    Memos: buildMemoHex(memo),
  };

  const prepared = await client.autofill(tx);
  const signed = providerWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  const txResult = result.result.meta && typeof result.result.meta === "object" ? (result.result.meta as { TransactionResult?: string }).TransactionResult : undefined;
  if (txResult !== "tesSUCCESS") {
    throw new Error(`PaymentChannelClaim for ${providerId} failed: ${txResult ?? "unknown result"}`);
  }

  state.cumulativeDrops = newCumulative;

  return {
    txHash: signed.hash,
    explorerUrl: explorerUrl(signed.hash),
    amountDrops: taskCostDrops.toString(),
    channelId: state.channelId,
  };
}

export function usdToDrops(usd: number, xrpUsdRate: number): string {
  const xrp = usd / xrpUsdRate;
  return xrpToDrops(xrp.toFixed(6));
}

export function resetChannelsForTest(): void {
  channels.clear();
}
