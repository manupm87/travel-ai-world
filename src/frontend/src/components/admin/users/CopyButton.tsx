"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

/** Copies `value` to the clipboard; says "Copied" for a moment after. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t.admin.common.copied : label}
      title={copied ? t.admin.common.copied : label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
