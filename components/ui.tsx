"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CheckIcon, ChevronIcon, CopyIcon, DownloadIcon, type IconProps } from "./icons";
import { fmtScore } from "./format";

/* ---------------------------------------------------------------- Pill --- */

export type PillTone = "neutral" | "accent" | "warn" | "danger" | "info";

export function Pill({
  tone = "neutral",
  icon: Icon,
  children,
  title,
}: {
  tone?: PillTone;
  icon?: (p: IconProps) => React.JSX.Element;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Meter --- */

/**
 * A 0..1 bar. `role="progressbar"` rather than `role="meter"` — better AT
 * support today. The numeric value is always rendered as adjacent text by
 * the caller, so the bar is never the sole carrier of the information.
 */
export function Meter({
  value,
  label,
  tone = "accent",
  delayIndex = 0,
}: {
  value: number;
  label: string;
  tone?: "accent" | "muted";
  delayIndex?: number;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(clamped.toFixed(2))}
      aria-valuetext={fmtScore(clamped)}
    >
      <div
        className={`meter-fill meter-fill-${tone}`}
        style={{ "--v": `${clamped * 100}%`, "--i": delayIndex } as CSSProperties}
      />
    </div>
  );
}

/* ---------------------------------------------------------- CopyButton --- */

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked (insecure origin / permission) — stay silent
    }
  }, [value]);

  return (
    <button type="button" className="btn-icon" onClick={copy} aria-label={copied ? "Copied" : label}>
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      <span className="sr-only" role="status">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}

/* ------------------------------------------------------ DownloadButton --- */

/**
 * Saves the given content as a local file via a throwaway object URL —
 * only rendered by callers that already determined the content is
 * file-shaped (see lib/shared/outputFile.ts), not for every answer.
 */
export function DownloadButton({ filename, content, label }: { filename: string; content: string; label?: string }) {
  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, filename]);

  return (
    <button type="button" className="btn-icon" onClick={download} aria-label={label ?? `Download ${filename}`} title={label ?? `Download ${filename}`}>
      <DownloadIcon size={14} />
    </button>
  );
}

/* ---------------------------------------------------------- Disclosure --- */

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <ChevronIcon size={14} className="disclosure-chevron" />
        <span>{summary}</span>
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------ Skeleton --- */

export function Skeleton({ width, height = 12 }: { width?: string; height?: number }) {
  return <span className="skeleton" style={{ width: width ?? "100%", height }} aria-hidden="true" />;
}

/* ---------------------------------------------------------- EmptyState --- */

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {hint ? <p className="empty-state-hint">{hint}</p> : null}
    </div>
  );
}
