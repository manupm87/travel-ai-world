import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>{children}</LanguageProvider>
    </ThemeProvider>
  );
}

/**
 * Renders with the real language and theme providers, so tests assert the
 * English copy from `src/i18n/en.ts` instead of a hand-written `t` mock.
 * Auth and navigation are still mocked per test where needed.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: Providers, ...options });
}

export * from "@testing-library/react";
