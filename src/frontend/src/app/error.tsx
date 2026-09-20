"use client";

import { useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/Button";

/**
 * Global Error Boundary (`error.tsx`).
 *
 * The last thing standing between an unhandled render error and a blank page.
 * It says what happened in the interface's own voice and offers the one thing
 * that can still help — rendering the segment again. The thrown message is not
 * shown: a stack's wording is for the console, which is where it goes.
 *
 * @param error - The Error object that was caught.
 * @param reset - A function to try re-rendering the segment that threw the error.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    // The boundary is the last place this error is seen; keep the trace.
    // eslint-disable-next-line no-console
    console.error("Global Error Boundary caught an error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div
        role="alert"
        className="w-full max-w-[30rem] rounded-2xl border border-glass-border bg-glass-bg p-8 text-center shadow-field-glow backdrop-blur-xl"
      >
        <h2 className="text-2xl leading-tight font-light text-text-primary">
          {t.errors.title}
        </h2>
        <p className="mx-auto mt-3 max-w-[42ch] text-[15px] leading-relaxed text-text-secondary">
          {t.errors.description}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={reset}
          className="mt-7 rounded-full px-6 py-3"
        >
          {t.errors.retry}
        </Button>
      </div>
    </main>
  );
}
