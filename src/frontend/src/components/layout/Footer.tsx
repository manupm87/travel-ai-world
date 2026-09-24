"use client";

import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n/interpolate";
import { Container } from "@/components/ui/Container";

/**
 * Global footer: one quiet line under the page — the copyright on the left,
 * and on the right where the guides and the maps come from (TRA-236). The
 * reader's own controls, language and theme, live in the header now, so the
 * footer carries nothing to press.
 *
 * It paints nothing of its own: transparent, the sky runs all the way down
 * past the line of text instead of being cut off by a band.
 */
export default function Footer() {
  const { t } = useLanguage();
  // Rendered on the client, so the year is the reader's, not the build's; the
  // prerendered markup may carry the previous one for a few hours in January.
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
