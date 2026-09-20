"use client";

import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n/interpolate";
import { Container } from "@/components/ui/Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Global footer: one line under the page — the wordmark, the copyright, and
 * the two controls that belong to the reader rather than to the trip
 * (language and theme). Nothing else: the site has no other destinations.
 */
export default function Footer() {
  const { t } = useLanguage();
  // Rendered on the client, so the year is the reader's, not the build's; the
  // prerendered markup may carry the previous one for a few hours in January.
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-glass-border bg-bg-footer/40 py-6">
      <Container className="px-6 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <Logo />
          <p className="text-text-secondary text-xs" suppressHydrationWarning>
            {interpolate(t.footer.copyright, { year })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="segmented" />
          <ThemeToggle />
        </div>
      </Container>
    </footer>
  );
}
