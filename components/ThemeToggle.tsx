"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

export type ThemeChoice = "system" | "dark" | "light";

const ORDER: ThemeChoice[] = ["system", "dark", "light"];

const LABEL: Record<ThemeChoice, string> = {
  system: "System theme",
  dark: "Dark theme",
  light: "Light theme",
};

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    localStorage.setItem("bidstream-theme", choice);
  } catch {
    // private mode / storage disabled — the choice just won't persist
  }
}

/**
 * Lets the presenter force dark regardless of the laptop's OS setting.
 * Reads the value the inline bootstrap script in app/layout.tsx already
 * applied, so there is no flash and no hydration mismatch.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = document.documentElement.dataset.theme as ThemeChoice | undefined;
    setChoice(stored === "dark" || stored === "light" ? stored : "system");
  }, []);

  const cycle = useCallback(() => {
    setChoice((prev) => {
      const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
      apply(next);
      return next;
    });
  }, []);

  // Render the neutral icon until mounted so SSR and first paint agree.
  const Icon = !mounted || choice === "system" ? MonitorIcon : choice === "dark" ? MoonIcon : SunIcon;

  return (
    <button type="button" className="btn-ghost" onClick={cycle} aria-label={`${LABEL[choice]}. Click to change.`}>
      <Icon size={16} />
      <span className="btn-ghost-label">{mounted ? LABEL[choice].replace(" theme", "") : "Theme"}</span>
    </button>
  );
}
