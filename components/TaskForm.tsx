"use client";

import { useCallback, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ComplexityHint } from "@/lib/shared/types";
import type { SseStatus } from "@/hooks/useSSE";
import { AlertIcon, BoltIcon, SpinnerIcon } from "./icons";

interface Preset {
  label: string;
  prompt: string;
  complexityHint: ComplexityHint;
  budgetUsd: number;
}

/** Mirrors scripts/demoRun.ts so the dashboard and the scripted demo agree. */
const PRESETS: Preset[] = [
  {
    label: "Summarise a changelog",
    prompt: "Summarize this changelog entry in one sentence: 'Fixed a race condition in the retry queue.'",
    complexityHint: "simple",
    budgetUsd: 0.05,
  },
  {
    label: "Compare REST vs GraphQL",
    prompt:
      "Compare REST and GraphQL for a mobile app backend and explain step by step which you'd recommend and why.",
    complexityHint: "complex",
    budgetUsd: 0.5,
  },
  {
    label: "Review an NDA clause",
    prompt: "Review this NDA clause for compliance risk and explain step by step whether we should sign it.",
    complexityHint: "complex",
    budgetUsd: 0.5,
  },
];

export function TaskForm({
  sessionId,
  sseStatus,
  onSubmitted,
}: {
  sessionId: string | null;
  sseStatus: SseStatus;
  onSubmitted: (args: {
    taskId: string;
    prompt: string;
    complexityHint: ComplexityHint;
    budgetUsd: number;
  }) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [complexity, setComplexity] = useState<ComplexityHint>("standard");
  const [budget, setBudget] = useState("0.20");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const applyPreset = useCallback((preset: Preset) => {
    setPrompt(preset.prompt);
    setComplexity(preset.complexityHint);
    setBudget(preset.budgetUsd.toFixed(2));
    setError(null);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = prompt.trim();

    // Each of these used to be a silent `return` that left the button
    // looking live and the user with no idea why nothing happened.
    if (!sessionId) {
      setError("The session is still starting. Wait for the Live indicator, then try again.");
      return;
    }
    if (!trimmed) {
      setError("Enter a task before running the auction.");
      return;
    }

    const budgetUsd = Number(budget);
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
      // A blank budget previously sent null, and the server substituted the
      // entire remaining cap — a spending surprise dressed as a no-op.
      setError("Enter a budget above $0.00.");
      return;
    }

    setSubmitting(true);
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
      onSubmitted({ taskId: body.taskId, prompt: trimmed, complexityHint: complexity, budgetUsd });
      setPrompt("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  const disabled = submitting || !sessionId || !prompt.trim();

  return (
    <section className="panel task-form">
      <h2>Submit a task</h2>

      <div className="presets" role="group" aria-label="Example tasks">
        {PRESETS.map((preset) => (
          <button key={preset.label} type="button" className="btn-ghost" onClick={() => applyPreset(preset)}>
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="prompt">
          Task prompt
        </label>
        <textarea
          id="prompt"
          placeholder="e.g. Review this NDA clause for compliance risk…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-describedby="prompt-hint"
        />
        <p id="prompt-hint" className="field-hint">
          All four industry agents bid on every task. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit.
        </p>

        <div className="form-row">
          <label htmlFor="complexity">
            Complexity
            <select
              id="complexity"
              value={complexity}
              onChange={(e) => setComplexity(e.target.value as ComplexityHint)}
            >
              <option value="simple">Simple</option>
              <option value="standard">Standard</option>
              <option value="complex">Complex</option>
            </select>
          </label>
          <label htmlFor="budget">
            Budget (USD)
            <input
              id="budget"
              type="number"
              step="0.01"
              min="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <button type="submit" disabled={disabled} aria-busy={submitting}>
            {submitting ? <SpinnerIcon size={14} /> : <BoltIcon size={14} />}
            {submitting ? "Running auction…" : "Run auction"}
          </button>
        </div>

        {sseStatus !== "open" && !error ? (
          <p className="field-hint warn-hint">
            Live updates are {sseStatus}. You can still submit, and results will appear once the stream
            reconnects.
          </p>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            <AlertIcon size={14} />
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
