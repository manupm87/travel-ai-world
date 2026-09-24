"use client";

import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { LANGUAGES } from "@/i18n";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/utils/cn";

interface LanguageSwitcherProps {
  /** `dropdown` is the header's pill; `segmented` the phone menu's full-width choice. */
  variant?: "dropdown" | "segmented";
}

/**
 * The reader's language (TRA-236). In the header, a glass pill — a globe and
 * the two-letter code — that opens a short menu; in the phone menu, the
 * languages side by side by their own names, the chosen one filled with the
 * action colour.
 */
export function LanguageSwitcher({ variant = "dropdown" }: LanguageSwitcherProps) {
  const { t, language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(rootRef, close, open);

  if (variant === "segmented") {
    return (
      <div
        role="group"
        aria-label={t.nav.selectLanguage}
        className="grid w-full grid-flow-col auto-cols-fr gap-1 rounded-2xl bg-bg-surface/60 p-1"
      >
        {LANGUAGES.map(({ code, nativeName }) => {
          const active = language === code;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              onClick={() => setLanguage(code)}
              aria-pressed={active}
              className={cn(
                "h-11 rounded-xl text-[15px] font-medium transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                active
                  ? "bg-action text-on-action"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {nativeName}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.nav.selectLanguage}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-full border border-glass-border bg-glass-bg px-3 text-sm font-medium text-text-secondary backdrop-blur-xl transition-colors hover:text-text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Globe size={16} aria-hidden="true" />
        <span className="uppercase">{language}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("transition-transform duration-300", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.nav.selectLanguage}
          className="absolute top-full right-0 z-10 mt-2 w-40 origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-glass-border bg-glass-bg p-1 shadow-2xl backdrop-blur-xl"
        >
          {LANGUAGES.map(({ code, flag, nativeName }) => {
            const active = language === code;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={code}
                onClick={() => {
                  setLanguage(code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer hover:bg-bg-surface",
                  active ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                )}
              >
                <span aria-hidden="true">{flag}</span>
                <span className="flex-1 text-left">{nativeName}</span>
                {active && <Check size={14} aria-hidden="true" className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
