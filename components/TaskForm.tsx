"use client";

import { useState, type FormEvent } from "react";
import type { ComplexityHint } from "@/lib/shared/types";

export function TaskForm({
  sessionId,
  onSubmitted,
}: {
  sessionId: string | null;
  onSubmitted: (args: { taskId: string; prompt: string; budgetUsd: number }) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [complexity, setComplexity] = useState<ComplexityHint>("standard");
  const [budget, setBudget] = useState("0.20");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    const budgetUsd = Number(budget);
    if (!trimmed || !sessionId) return;

    try {
      const res = await fetch(`/api/session/${sessionId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, complexityHint: complexity, budgetUsd }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.taskId) {
        throw new Error(body?.error ?? `failed to submit task (${res.status})`);
      }
      onSubmitted({ taskId: body.taskId, prompt: trimmed, budgetUsd });
      setPrompt("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="panel" id="task-form-panel">
      <h2>Submit a task</h2>
      <form id="task-form" onSubmit={handleSubmit}>
        <textarea
          id="prompt"
          placeholder="Describe the task…"
          required
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="form-row">
          <label>
            Complexity
            <select value={complexity} onChange={(e) => setComplexity(e.target.value as ComplexityHint)}>
              <option value="simple">Simple</option>
              <option value="standard">Standard</option>
              <option value="complex">Complex</option>
            </select>
          </label>
          <label>
            Budget (USD)
            <input type="number" step="0.01" min="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <button type="submit">Run auction</button>
        </div>
        {error && <p style={{ color: "var(--danger)", marginTop: 8 }}>{error}</p>}
      </form>
    </section>
  );
}
