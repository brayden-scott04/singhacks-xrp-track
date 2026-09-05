import type { MemoPayload } from "./types";

const MEMO_TYPE = "bidstream/audit-v1";
const MEMO_FORMAT = "application/json";

function toHex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex").toUpperCase();
}

function fromHex(hex: string): string {
  return Buffer.from(hex, "hex").toString("utf8");
}

const REQUIRED_FIELDS: Array<keyof MemoPayload> = [
  "providerId",
  "bidPricePerInputTokenUsd",
  "bidPricePerOutputTokenUsd",
  "bidTotalCostUsd",
  "qualityScore",
  "taskComplexityScore",
  "taskId",
  "winningReason",
];

/**
 * Throws before any XRPL submission if the audit payload is incomplete.
 * This is the safeguard that makes every settlement self-justifying — no
 * payment can leave without a decodable reason attached.
 */
export function assertMemoComplete(payload: Partial<MemoPayload>): asserts payload is MemoPayload {
  const missing = REQUIRED_FIELDS.filter((field) => payload[field] === undefined || payload[field] === null);
  if (missing.length > 0) {
    throw new Error(`Refusing to settle: memo payload missing required field(s): ${missing.join(", ")}`);
  }
}

export interface XrplMemoWrapper {
  Memo: {
    MemoType: string;
    MemoFormat: string;
    MemoData: string;
  };
}

export function buildMemoHex(payload: MemoPayload): XrplMemoWrapper[] {
  assertMemoComplete(payload);
  const json = JSON.stringify(payload);
  return [
    {
      Memo: {
        MemoType: toHex(MEMO_TYPE),
        MemoFormat: toHex(MEMO_FORMAT),
        MemoData: toHex(json),
      },
    },
  ];
}

export function decodeMemoHex(memos: XrplMemoWrapper[] | undefined): MemoPayload | null {
  const entry = memos?.[0]?.Memo;
  if (!entry?.MemoData) return null;
  try {
    return JSON.parse(fromHex(entry.MemoData)) as MemoPayload;
  } catch {
    return null;
  }
}
