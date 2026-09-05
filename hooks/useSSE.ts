"use client";

import { useEffect, useRef, useState } from "react";
import type { BidStreamEvent } from "@/lib/store/eventBus";

export type SseStatus = "connecting" | "open" | "reconnecting";

/**
 * Opens an EventSource and reports its connection state so the UI can show
 * a live/reconnecting indicator — previously a dropped stream just made the
 * dashboard silently stop updating.
 *
 * `onEvent` and `onOpen` are kept in refs so callers can pass fresh closures
 * every render without forcing a reconnect; only `url` changing does that.
 *
 * Note: the server publishes with no replay buffer, so events that occur
 * while disconnected are gone. `onOpen` exists so the caller can re-fetch
 * the resyncable state (session + settlements); an in-flight round's bids
 * cannot be recovered.
 */
export function useSSE(url: string, onEvent: (event: BidStreamEvent) => void, onOpen?: () => void): SseStatus {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const [status, setStatus] = useState<SseStatus>("connecting");

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    function connect() {
      source = new EventSource(url);

      source.onopen = () => {
        if (closed) return;
        attempt = 0;
        setStatus("open");
        onOpenRef.current?.();
      };

      source.onmessage = (msg) => {
        try {
          onEventRef.current(JSON.parse(msg.data) as BidStreamEvent);
        } catch {
          // ignore keep-alive / malformed frames
        }
      };

      source.onerror = () => {
        source?.close();
        if (closed) return;
        setStatus("reconnecting");
        // 2s, 4s, 8s, capped — avoids hammering a server that is still booting
        const delay = Math.min(8000, 2000 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [url]);

  return status;
}
