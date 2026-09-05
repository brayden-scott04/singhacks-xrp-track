"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

type Theme = "dark" | "light";

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("bidstream-theme", theme);
  } catch {
    // private mode / storage disabled — the choice just won't persist
  }
}

/**
 * A straight two-state switch. It previously cycled system -> dark -> light,
 * which meant getting from light back to dark took two clicks through a state
 * most people did not want.
 *
 * The OS preference still decides the *initial* theme: until someone clicks,
 * no data-theme attribute is set and the CSS follows prefers-color-scheme.
 * The first click just resolves that to whichever theme is actually showing
 * and flips it.
 *
 * The icon and label name the theme you will GET, not the one you are in —
 * "Light" with a sun means clicking gives you light.
 */
export function ThemeToggle() {
  // null until mounted, so the server render and first paint agree.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      apply(next);
      return next;
    });
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  const Icon = theme === null ? MonitorIcon : next === "dark" ? MoonIcon : SunIcon;

  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={toggle}
      aria-label={theme === null ? "Switch theme" : `Switch to the ${next} theme`}
    >
      <Icon size={16} />
      <span className="btn-ghost-label">{theme === null ? "Theme" : next === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
