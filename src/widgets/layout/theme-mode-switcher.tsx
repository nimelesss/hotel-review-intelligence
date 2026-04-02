"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";

type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "hri-theme-mode";

const OPTIONS: Array<{ mode: ThemeMode; label: string; shortLabel: string }> = [
  { mode: "light", label: "Светлая", shortLabel: "Свет" },
  { mode: "dark", label: "Темная", shortLabel: "Ночь" },
  { mode: "system", label: "Системная", shortLabel: "Система" }
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

export function ThemeModeSwitcher({ compact = false }: { compact?: boolean }) {
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

  if (compact) {
    return (
      <div className="theme-switcher flex rounded-full border border-border bg-panelMuted p-1 shadow-soft">
        {OPTIONS.map((option) => {
          const active = option.mode === mode;
          return (
            <button
              key={option.mode}
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-200",
                active ? "bg-panelSolid text-text shadow-soft" : "text-textMuted hover:text-text"
              )}
              data-active={active}
              onClick={() => setThemeMode(option.mode)}
              aria-label={option.label}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="theme-switcher glass-panel surface-ring rounded-[1.35rem] border border-border bg-panelMuted p-3 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-textMuted">Тема интерфейса</p>
          <p className="mt-1 text-xs leading-5 text-textSoft">Переключение без перезагрузки и с учетом системной настройки.</p>
        </div>
        <span className="rounded-full border border-border bg-panelSolid px-3 py-1 text-[11px] font-semibold text-textMuted">
          {OPTIONS.find((option) => option.mode === mode)?.label}
        </span>
      </div>
      <div className="relative mt-3 grid grid-cols-3 rounded-[1rem] border border-border bg-panelSolid p-1 shadow-insetSoft">
        <span
          className="theme-switcher-thumb pointer-events-none absolute bottom-1 top-1 w-[calc(33.333%-0.25rem)] rounded-[0.85rem] bg-accentSoft"
          style={{ transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 0.25}rem))` }}
          aria-hidden
        />
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="theme-switcher-button relative z-[1] rounded-[0.85rem] px-3 py-2 text-xs font-semibold transition-colors"
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

