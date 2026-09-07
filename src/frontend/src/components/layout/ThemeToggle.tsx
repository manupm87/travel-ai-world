"use client";

import { Moon, Sun } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

interface ThemeToggleProps {
  /** `icon` is the compact header button; `labeled` adds the target mode's name. */
  variant?: "icon" | "labeled";
}

export function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const Icon = theme === "dark" ? Sun : Moon;
  const targetLabel = theme === "dark" ? t.theme.light : t.theme.dark;

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-soft bg-bg-secondary text-xs text-text-primary cursor-pointer"
      >
        <Icon size={14} aria-hidden="true" />
        {targetLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={t.theme.toggle}
      aria-label={t.theme.toggle}
      className="flex items-center justify-center w-9 h-9 rounded-xl border border-border-soft bg-bg-secondary hover:bg-bg-surface transition-all text-text-primary cursor-pointer"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
