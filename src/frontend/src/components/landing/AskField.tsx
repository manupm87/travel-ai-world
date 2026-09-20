"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { LoginModal } from "@/components/auth/LoginModal";
import { Button } from "@/components/ui/Button";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useTypewriter } from "@/hooks/useTypewriter";
import { cn } from "@/utils/cn";
import { safeRedirectTarget } from "@/utils/safeRedirect";

/** How long the page fades before the planner takes over. */
const FADE_MS = 250;
/** The field stops growing here and scrolls instead. */
const TEXTAREA_MAX_PX = 200;

const HEADING_ID = "ask-headline";

/**
 * The query string, read from the browser rather than through
 * `useSearchParams`, which would keep this page out of the prerendered HTML.
 * It cannot change without a navigation, so there is nothing to subscribe to;
 * prerendering sees none of it.
 */
const subscribeToSearch = () => () => {};
const searchSnapshot = () => window.location.search;
const searchServerSnapshot = () => "";

/** The planner, opened with what was typed. */
export function plannerHref(ask: string): string {
  return `/plan/?q=${encodeURIComponent(ask)}`;
}

export interface AskFieldProps {
  /**
   * `page` (the landing) fills the viewport and centres itself; `inline` (the
   * top of the dashboard) takes only the room it needs, above the trips.
   */
  variant?: "page" | "inline";
}

/**
 * The landing page: one question, one field, one action.
 *
 * Everything the site asks of a first-time reader is here — a sentence about
 * the trip they already have in mind. The placeholder types example asks out
 * one after another (`useTypewriter`), which is why there is no row of example
 * chips under the field.
 *
 * Signed in, sending opens `/plan/?q=…`. Signed out, the same press opens the
 * sign-in dialog with that exact path as its redirect, so the ask survives the
 * Cognito round-trip (the pending login carries it) and the Google one (the
 * modal navigates there itself). Arriving with `?redirect=` — the route guard
 * sent someone here from a signed-in page — opens the dialog straight away.
 *
 * The dashboard mounts the same component as its own first block (`inline`),
 * so the sentence that starts a trip is in the same place on both pages and
 * exists once in the codebase.
 */
export function AskField({ variant = "page" }: AskFieldProps = {}) {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [ask, setAsk] = useState("");
  const [leaving, setLeaving] = useState(false);
  // `null` while nothing has been pressed: the dialog then answers to the
  // guard's `?redirect=` alone, and closing it is a decision of its own.
  const [login, setLogin] = useState<{
    open: boolean;
    redirect: string | null;
  } | null>(null);

  const { ref: fieldRef, resize } = useAutoResizeTextarea(ask, TEXTAREA_MAX_PX);
  const placeholder = useTypewriter(t.landing.examples);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  // The guard sends people here with the page it turned them away from.
  // `URLSearchParams` decodes that value once, which is exactly once for a
  // path whose own query holds an ask.
  const search = useSyncExternalStore(
    subscribeToSearch,
    searchSnapshot,
    searchServerSnapshot
  );
  const sentHere =
    !isLoading && !isAuthenticated
      ? safeRedirectTarget(new URLSearchParams(search).get("redirect"))
      : null;

  const loginOpen = login ? login.open : sentHere !== null;
  const loginRedirect = login?.redirect ?? sentHere;

  const trimmed = ask.trim();
  const canSubmit = trimmed.length > 0 && !leaving;
  const page = variant === "page";

  const open = (href: string) => {
    setLeaving(true);
    const navigate = () => router.push(href);
    // The browser cross-fades the two pages where it can; everywhere else the
    // block above fades out on its own and the push waits for it.
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(navigate);
      return;
    }
    timer.current = window.setTimeout(navigate, FADE_MS);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    const href = plannerHref(trimmed);
    if (isAuthenticated) {
      open(href);
      return;
    }
    setLogin({ open: true, redirect: href });
  };

  // Enter sends, Shift+Enter breaks the line: the same contract as the
  // planner's composer, so the gesture carries over to the next page.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (event.shiftKey && !event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };

  return (
    <section
      className={cn(
        "flex items-center justify-center px-4 sm:px-6",
        page ? "flex-1 py-(--header-h)" : "pt-10 pb-12 sm:pt-14"
      )}
    >
      <div
        data-leaving={leaving}
        className={cn(
          "w-full max-w-[38rem] animate-fade-up transition-opacity duration-300",
          leaving && "opacity-0"
        )}
      >
        <h1
          id={HEADING_ID}
          className={cn(
            "text-center leading-[1.05] font-light text-text-primary",
            page
              ? "mb-7 text-[clamp(2.5rem,9vw,4rem)]"
              : "mb-5 text-[clamp(1.75rem,6vw,2.5rem)]"
          )}
        >
          {t.landing.headline}
        </h1>

        <form onSubmit={submit} className="group relative">
          {/* The conic ring, turning while the field has the focus. */}
          <span
            aria-hidden="true"
            className="conic-ring pointer-events-none absolute -inset-px rounded-[27px] opacity-0 transition-opacity duration-300 group-focus-within:animate-ring-spin group-focus-within:opacity-100"
          />

          <div className="relative rounded-[26px] border border-glass-border bg-glass-bg p-2 shadow-field-glow backdrop-blur-xl transition-colors group-focus-within:border-transparent">
            <textarea
              ref={fieldRef}
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              onInput={resize}
              onKeyDown={onKeyDown}
              rows={1}
              autoComplete="off"
              aria-labelledby={HEADING_ID}
              placeholder={placeholder}
              className="block min-h-[4.25rem] w-full resize-none bg-transparent px-4 pt-3 text-[17px] leading-relaxed text-text-primary placeholder:text-text-secondary focus:outline-none"
              style={{ maxHeight: `${TEXTAREA_MAX_PX}px` }}
            />
            <div className="flex justify-end px-2 pb-1">
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit}
                aria-busy={leaving}
                className="gap-2 rounded-full px-5 py-2.5 text-sm shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {leaving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {leaving ? t.landing.sending : t.landing.send}
              </Button>
            </div>
          </div>
        </form>
      </div>

      <Suspense fallback={null}>
        <LoginModal
          isOpen={loginOpen}
          redirect={loginRedirect}
          onClose={() => setLogin({ open: false, redirect: null })}
        />
      </Suspense>
    </section>
  );
}
