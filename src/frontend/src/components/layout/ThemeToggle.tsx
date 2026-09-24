"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";
import { cn } from "@/utils/cn";

interface ThemeToggleProps {
  /**
   * `icon` is the header's round button, which flips between dark and light;
   * `segmented` the phone menu's three choices — dark, light, or whatever the
   * system says (TRA-236).
   */
  variant?: "icon" | "segmented";
}

export function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, preference, toggleTheme, setTheme } = useTheme();
  const { t } = useLanguage();

  if (variant === "segmented") {
    const choices: Array<{ value: ThemePreference; label: string; Icon?: typeof Moon }> = [
      { value: "dark", label: t.theme.darkShort, Icon: Moon },
      { value: "light", label: t.theme.lightShort, Icon: Sun },
      { value: "system", label: t.theme.system, Icon: Monitor },
    ];
    return (
      <div
        role="group"
        aria-label={t.theme.label}
        className="grid w-full grid-cols-3 gap-1 rounded-2xl bg-bg-surface/60 p-1"
      >
        {choices.map(({ value, label, Icon }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-medium transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                active ? "bg-action text-on-action" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {Icon && <Icon size={15} aria-hidden="true" />}
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = theme === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={t.theme.toggle}
      aria-label={t.theme.toggle}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-text-secondary backdrop-blur-xl transition-colors hover:text-text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
