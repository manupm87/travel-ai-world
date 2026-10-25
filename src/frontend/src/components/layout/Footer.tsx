"use client";

/** The global footer. */

import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n/interpolate";
import { Container } from "@/components/ui/Container";

/**
 * Global footer: the copyright and the data credits on one line.
 * Transparent, so the aurora runs down past it instead of ending at a band.
 */
export default function Footer() {
  const { t } = useLanguage();
  // the reader's year, not the build's; the prerendered markup may lag for a few hours in January
  const year = new Date().getFullYear();

  return (
    <footer className="bg-transparent">
      <Container className="flex min-h-16 flex-col items-center justify-center gap-1 px-5 py-4 text-[13px] text-text-muted sm:flex-row sm:justify-between sm:gap-5 md:px-10">
        <p suppressHydrationWarning>{interpolate(t.footer.copyright, { year })}</p>
        <p className="hidden text-center sm:block">{t.footer.sources}</p>
      </Container>
    </footer>
  );
}
