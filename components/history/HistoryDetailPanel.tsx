"use client";

import { useEffect, useState } from "react";
import { shortHash } from "../format";
import { CheckIcon, XIcon } from "../icons";
import { Disclosure, Pill } from "../ui";
import { MemoView } from "../MemoView";
import { RoundCard } from "../RoundCard";
import type { StoredTaskHistory } from "@/lib/shared/historyTypes";
import type { MemoPayload } from "@/lib/shared/types";
import { historyRowToRound } from "./historyToRound";

type Props = {
  taskId: string;
  onClose: () => void;
};

interface MemoVerifyResult {
  txHash: string;
  validated: boolean;
  onLedgerMemo: MemoPayload | null;
  matchesLocalCopy: boolean;
}

/**
 * The one thing MemoView doesn't do: fetch the settlement transaction back
 * off XRPL testnet and decode its memo from the ledger itself, so the audit
 * trail is a demonstration rather than an assertion. This is the only
 * caller of decodeMemoHex() (lib/shared/memo.ts) anywhere in the app.
 */
function LedgerVerify({ taskId, txHash }: { taskId: string; txHash: string }) {
  const [result, setResult] = useState<MemoVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/history/${taskId}/memo`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      setResult(body as MemoVerifyResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="ledger-verify">
      <button type="button" className="btn-ghost" onClick={check} disabled={checking}>
        {checking ? "Checking XRPL testnet…" : "Verify memo on ledger"}
      </button>
      {error ? <p className="settlement-fallback-reason mono">{error}</p> : null}
      {result ? (
        <>
          <p className="field-hint">
            {result.matchesLocalCopy ? (
              <Pill tone="accent" icon={CheckIcon}>
                Matches the on-chain memo
              </Pill>
            ) : (
              <Pill tone="danger" icon={XIcon}>
                Differs from the on-chain memo
              </Pill>
            )}
            <span className="dim mono"> {shortHash(result.txHash)}</span>
            {result.validated ? null : <span className="dim"> (not yet validated by consensus)</span>}
          </p>
          <Disclosure summary="Memo decoded directly from XRPL testnet">
            <pre>{JSON.stringify(result.onLedgerMemo, null, 2)}</pre>
          </Disclosure>
        </>
      ) : null}
    </div>
  );
}

export function HistoryDetailPanel({ taskId, onClose }: Props) {
  const [entry, setEntry] = useState<StoredTaskHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(null);
    setError(null);
    const controller = new AbortController();
    fetch(`/api/history/${taskId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
        return body as StoredTaskHistory;
      })
      .then(setEntry)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [taskId]);

  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <h2>Task detail</h2>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {error ? <p className="banner-body">{error}</p> : null}
      {!entry && !error ? <p className="dim">Loading…</p> : null}

      {entry
        ? (() => {
            const { round, memo, settlement } = historyRowToRound(entry);
            return (
              <>
                <RoundCard round={round} expanded onToggle={() => {}} />
                <MemoView memo={memo} settlement={settlement} />
                {settlement ? <LedgerVerify taskId={entry.taskId} txHash={settlement.txHash} /> : null}
              </>
            );
          })()
        : null}
    </section>
  );
}
