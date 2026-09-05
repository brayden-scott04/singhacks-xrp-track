/**
 * Scripted, repeatable demo: creates a session, submits a few tasks of
 * varying complexity, and prints the auction + settlement result for each
 * by watching the agent's SSE event stream. Requires `npm run dev` running
 * in another terminal first (or point DEMO_BASE_URL at a deployed URL).
 */

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3000";

interface DemoTask {
  prompt: string;
  complexityHint: "simple" | "standard" | "complex";
  budgetUsd: number;
}

const DEMO_TASKS: DemoTask[] = [
  { prompt: "Summarize this changelog entry in one sentence: 'Fixed a race condition in the retry queue.'", complexityHint: "simple", budgetUsd: 0.05 },
  { prompt: "Compare REST and GraphQL for a mobile app backend and explain step by step which you'd recommend and why.", complexityHint: "complex", budgetUsd: 0.5 },
  { prompt: "Write a one-line Slack status update for someone in a client meeting.", complexityHint: "simple", budgetUsd: 0.02 },
];

async function createSession(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/session`, { method: "POST" });
  if (!res.ok) throw new Error(`failed to create session: ${res.status}`);
  const body = (await res.json()) as { sessionId: string };
  return body.sessionId;
}

function watchEventsUntil(
  sessionId: string,
  predicate: (event: any) => boolean,
  timeoutMs: number,
  onEvent?: (event: any) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timed out waiting for task to settle"));
    }, timeoutMs);

    fetch(`${BASE_URL}/api/events`, { signal: controller.signal })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const chunk of lines) {
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const event = JSON.parse(dataLine.slice("data: ".length));
            if (event.sessionId === sessionId) {
              onEvent?.(event);
              if (predicate(event)) {
                clearTimeout(timer);
                controller.abort();
                resolve(event);
                return;
              }
            }
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) reject(err);
      });
  });
}

async function runOne(sessionId: string, task: DemoTask, index: number) {
  console.log(`\n=== Task ${index + 1}: "${task.prompt.slice(0, 60)}..." (budget $${task.budgetUsd}) ===`);

  const submitRes = await fetch(`${BASE_URL}/api/session/${sessionId}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  const { taskId } = (await submitRes.json()) as { taskId: string };
  console.log(`submitted taskId=${taskId}, watching for outcome...`);

  const terminal = await watchEventsUntil(
    sessionId,
    (e) => e.taskId === taskId && ["task.completed", "task.rejected", "task.failed"].includes(e.type),
    60_000,
    (e) => {
      if (e.taskId === taskId && e.type === "decision.made") {
        console.log("-- Industry agent scoring --");
        console.table(
          e.decision.ranked.map((r: any) => ({
            industry: r.bid.industryId,
            price: r.bid.factorScores.price.toFixed(2),
            load: r.bid.factorScores.load.toFixed(2),
            quality: r.bid.factorScores.quality.toFixed(2),
            knowledge: r.bid.factorScores.knowledge.toFixed(2),
            speed: r.bid.factorScores.speed.toFixed(2),
            "error%": r.bid.factorScores.errorRate.toFixed(2),
            context: r.bid.factorScores.contextWindow.toFixed(2),
            composite: r.score.toFixed(3),
            budgetFit: r.budgetFit,
          })),
        );
      }
    },
  );

  if (terminal.type === "task.completed") {
    console.log(`✓ completed. Output: ${String(terminal.output).slice(0, 200)}`);
  } else {
    console.log(`✗ ${terminal.type}: ${terminal.reason}`);
  }
}

async function main() {
  console.log(`BidStream demo run against ${BASE_URL}`);
  const sessionId = await createSession();
  console.log(`session: ${sessionId}`);

  for (let i = 0; i < DEMO_TASKS.length; i++) {
    await runOne(sessionId, DEMO_TASKS[i], i);
  }

  const summary = (await (await fetch(`${BASE_URL}/api/session/${sessionId}`)).json()) as {
    session: { spentUsd: number; capUsd: number; status: string };
    settlements: Array<{ providerId: string; mode: string; amountUsd: number; explorerUrl: string }>;
  };
  console.log(`\n=== Session summary ===`);
  console.log(`spent: $${summary.session.spentUsd.toFixed(6)} / cap $${summary.session.capUsd} (${summary.session.status})`);
  for (const s of summary.settlements) {
    console.log(`- ${s.providerId} via ${s.mode}: $${s.amountUsd.toFixed(6)} — ${s.explorerUrl}`);
  }
}

main().catch((err) => {
  console.error("demo run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
