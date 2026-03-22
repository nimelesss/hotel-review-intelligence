"use client";

import { useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "hri-theme-mode";

const OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: "light", label: "Светлая" },
  { mode: "dark", label: "Темная" },
  { mode: "system", label: "Системная" }
];

function readMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return mode;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
}

export function ThemeModeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const initial = readMode();
    setMode(initial);
    applyTheme(initial);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChanged = () => {
      const current = readMode();
      if (current === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", onSystemThemeChanged);
    return () => mediaQuery.removeEventListener("change", onSystemThemeChanged);
  }, []);

  const activeIndex = useMemo(() => {
    if (mode === "light") {
      return 0;
    }
    if (mode === "dark") {
      return 1;
    }
    return 2;
  }, [mode]);

  const setThemeMode = (next: ThemeMode) => {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div className="theme-switcher anim-fade-in rounded-lg border border-border bg-panelMuted p-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-textMuted">
        Тема интерфейса
      </p>
      <div className="relative mt-2 grid grid-cols-3 rounded-md bg-panel p-1 shadow-soft">
        <span
          className="theme-switcher-thumb pointer-events-none absolute bottom-1 top-1 w-[calc(33.333%-0.25rem)] rounded-[0.45rem] bg-accentSoft"
          style={{ transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 0.25}rem))` }}
          aria-hidden
        />
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="theme-switcher-button relative z-[1] rounded-[0.45rem] px-2 py-1.5 text-xs font-semibold transition-colors"
            data-active={option.mode === mode}
            onClick={() => setThemeMode(option.mode)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
