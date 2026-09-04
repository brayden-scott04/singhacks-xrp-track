import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { env } from "../shared/env.js";
import type { ComplexityHint } from "../shared/types.js";
import { publish, subscribe } from "./eventBus.js";
import { runTask } from "./orchestrator.js";
import { resumeSession } from "./safeguards/spendCap.js";
import { createSession, getSession, getSettlements, requireSession } from "./sessionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "dashboard", "public")));

app.post("/session", (req, res) => {
  const capUsd = typeof req.body?.capUsd === "number" && req.body.capUsd > 0 ? req.body.capUsd : env.SESSION_SPEND_CAP_USD;
  const session = createSession(capUsd);
  res.status(201).json(session);
});

app.get("/session/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "unknown session" });
    return;
  }
  res.json({ session, settlements: getSettlements(req.params.id) });
});

app.post("/session/:id/resume", (req, res) => {
  try {
    const session = requireSession(req.params.id);
    const newCapUsd = typeof req.body?.capUsd === "number" && req.body.capUsd > 0 ? req.body.capUsd : undefined;
    resumeSession(session, newCapUsd);
    publish({ type: "session.resumed", sessionId: session.sessionId, session });
    res.json(session);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

app.post("/session/:id/task", async (req, res) => {
  const sessionId = req.params.id;
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "unknown session" });
    return;
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const complexityHint: ComplexityHint = ["simple", "standard", "complex"].includes(req.body?.complexityHint)
    ? req.body.complexityHint
    : "standard";
  const budgetUsd = typeof req.body?.budgetUsd === "number" && req.body.budgetUsd > 0 ? req.body.budgetUsd : session.capUsd - session.spentUsd;

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const taskId = randomUUID();
  res.status(202).json({ taskId, sessionId, status: "accepted" });

  try {
    await runTask({ taskId, sessionId, prompt, complexityHint, budgetUsd, createdAt: new Date().toISOString() });
  } catch (err) {
    publish({ type: "task.failed", sessionId, taskId, reason: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const unsubscribe = subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

app.listen(env.PORT_AGENT, () => {
  console.log(`[agent] BidStream agent listening on :${env.PORT_AGENT}`);
  console.log(`[agent] dashboard: http://localhost:${env.PORT_AGENT}`);
});
