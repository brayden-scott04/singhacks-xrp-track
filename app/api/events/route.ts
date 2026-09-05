import { subscribe, type BidStreamEvent } from "@/lib/store/eventBus";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // stream already closed (client disconnected before cancel() ran) — ignore
        }
      };

      safeEnqueue(": connected\n\n");

      unsubscribe = subscribe((event: BidStreamEvent) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => safeEnqueue(": keep-alive\n\n"), HEARTBEAT_MS);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
