"use client";

import { useLanguage } from "@/context/LanguageContext";
import type { Translations } from "@/i18n";
import { cn } from "@/utils/cn";

/** Landing-page anchors, in display order. Labels come from `t.nav`. */
export const NAV_LINKS = [
  { href: "#how-it-works", key: "howItWorks" },
  { href: "#features", key: "features" },
  { href: "#testimonials", key: "reviews" },
] as const satisfies readonly { href: string; key: keyof Translations["nav"] }[];

interface MarketingNavProps {
  /** `desktop` is the inline header bar; `drawer` the stacked mobile list. */
  variant?: "desktop" | "drawer";
  onNavigate?: () => void;
}

export function MarketingNav({ variant = "desktop", onNavigate }: MarketingNavProps) {
  const { t } = useLanguage();
  const isDesktop = variant === "desktop";

  return (
    <nav
      className={cn(
        isDesktop ? "hidden lg:flex items-center gap-8" : "flex flex-col gap-8"
      )}
    >
      {NAV_LINKS.map(({ href, key }) => (
        <a
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            isDesktop
              ? "text-text-secondary text-sm hover:text-text-primary transition-colors"
              : "text-2xl font-medium text-text-primary hover:text-accent transition-colors"
          )}
        >
          {t.nav[key]}
        </a>
      ))}
    </nav>
  );
}
