"use client";

import { useEffect } from "react";
import { AlertIcon } from "@/components/icons";

/**
 * Without this, a render crash mid-demo yields a blank white page with no
 * way back. The dashboard's state is in-memory, so "reset" genuinely
 * recovers: it remounts and opens a fresh session.
 */
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard] render error:", error);
  }, [error]);

  return (
    <section className="banner banner-danger" role="alert">
      <p className="banner-title">
        <AlertIcon size={16} />
        The dashboard hit a rendering error
      </p>
      <p className="banner-body">{error.message || "Unknown error."}</p>
      <p className="banner-body">
        The agent and its XRPL settlement run on the server and are unaffected. This is a display problem only.
      </p>
      <button type="button" onClick={reset}>
        Reload dashboard
      </button>
    </section>
  );
}
