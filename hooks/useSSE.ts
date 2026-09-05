"use client";

import { useEffect, useRef } from "react";
import type { BidStreamEvent } from "@/lib/store/eventBus";

/**
 * Near-literal port of the old dashboard's connectEvents(): opens an
 * EventSource, reconnects with a fixed 2s backoff on error. `onEvent` is
 * kept in a ref so the caller can pass a fresh closure every render without
 * forcing a reconnect (only `url` changing does that).
 */
export function useSSE(url: string, onEvent: (event: BidStreamEvent) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      source = new EventSource(url);
      source.onmessage = (msg) => {
        try {
          onEventRef.current(JSON.parse(msg.data) as BidStreamEvent);
        } catch {
          // ignore keep-alive / malformed frames
        }
      };
      source.onerror = () => {
        source?.close();
        if (!closed) retryTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [url]);
}
