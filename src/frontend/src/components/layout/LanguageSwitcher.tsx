"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { LANGUAGES, getLanguageMeta } from "@/i18n";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/utils/cn";

interface LanguageSwitcherProps {
  /** `dropdown` is the header menu; `segmented` the mobile drawer's pill group. */
  variant?: "dropdown" | "segmented";
}

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
        className="flex items-center gap-2 bg-bg-secondary border border-border-soft rounded-2xl p-1.5 w-fit relative overflow-hidden"
      >
        {LANGUAGES.map(({ code, flag, nativeName }) => {
          const active = language === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              aria-pressed={active}
              aria-label={nativeName}
              className={cn(
                "relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-500 cursor-pointer overflow-hidden",
                active ? "text-white" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {active && (
                <span className="absolute inset-0 bg-accent shadow-accent-glow z-0" aria-hidden="true" />
              )}
              <span className="relative z-10 text-base" aria-hidden="true">{flag}</span>
              <span className="relative z-10 uppercase tracking-widest">{code}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const current = getLanguageMeta(language);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.nav.selectLanguage}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-soft bg-bg-secondary hover:bg-bg-surface transition-all text-[11px] font-medium text-text-primary cursor-pointer"
      >
        <span aria-hidden="true">{current.flag}</span>
        <span className="uppercase tracking-wider">{language}</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={cn("transition-transform duration-300", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.nav.selectLanguage}
          className="absolute top-full right-0 mt-2 w-32 bg-bg-primary/95 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
        >
          {LANGUAGES.map(({ code, flag, nativeName }) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={language === code}
              onClick={() => {
                setLanguage(code);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-[11px] font-medium transition-colors hover:bg-bg-secondary cursor-pointer",
                language === code
                  ? "text-accent bg-accent/5"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span aria-hidden="true">{flag}</span>
              <span className="uppercase tracking-widest">{nativeName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
