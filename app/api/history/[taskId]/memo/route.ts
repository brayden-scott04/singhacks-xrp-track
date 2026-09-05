import { NextResponse } from "next/server";
import { decodeMemoHex, type XrplMemoWrapper } from "@/lib/shared/memo";
import { historyStore } from "@/lib/store/historyStore";
import { getXrplClient } from "@/lib/xrpl/client";

/**
 * Re-fetches the settlement transaction from XRPL testnet by hash and
 * decodes its memo straight off the ledger — the one place in the app that
 * actually calls decodeMemoHex(). Everywhere else only ever renders the copy
 * this app wrote locally at settlement time; this route is what proves that
 * copy matches what's really on-chain, rather than merely asserting it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const entry = historyStore.getHistoryEntry(taskId);
  if (!entry) {
    return NextResponse.json({ error: "unknown task" }, { status: 404 });
  }
  if (!entry.txHash) {
    return NextResponse.json({ error: "this task has no on-chain settlement" }, { status: 404 });
  }

  try {
    const client = await getXrplClient();
    const response = await client.request({ command: "tx", transaction: entry.txHash });
    const memos = response.result.tx_json.Memos as XrplMemoWrapper[] | undefined;
    const onLedgerMemo = decodeMemoHex(memos);
    // Cross-check against the handful of fields this app already stored
    // locally at settlement time (a full MemoPayload isn't kept as one
    // object in history — it's spread across these discrete columns) so the
    // UI can show a real match/mismatch rather than just trusting the ledger.
    const matchesLocalCopy =
      onLedgerMemo !== null &&
      onLedgerMemo.taskId === entry.taskId &&
      onLedgerMemo.providerId === entry.winnerProviderId &&
      onLedgerMemo.industryId === entry.winnerIndustryId &&
      onLedgerMemo.winningReason === entry.decisionReason;
    return NextResponse.json({
      txHash: entry.txHash,
      validated: response.result.validated ?? false,
      onLedgerMemo,
      matchesLocalCopy,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `failed to fetch or decode transaction: ${reason}` }, { status: 502 });
  }
}
