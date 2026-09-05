"use client";

import type { MemoPayload } from "@/lib/shared/types";

export function MemoView({ memo }: { memo: MemoPayload | null }) {
  return (
    <section className="panel" id="memo-panel">
      <h2>Latest audit memo</h2>
      <pre id="memo-view">{memo ? JSON.stringify(memo, null, 2) : "—"}</pre>
    </section>
  );
}
