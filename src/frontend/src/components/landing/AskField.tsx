"use client";

/** The landing's ask field, which opens the planner. */

import { Suspense, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { LoginModal } from "@/components/auth/LoginModal";
import { AskComposer } from "@/components/common/AskComposer";
import { interpolate } from "@/i18n/interpolate";
import { useFormatters } from "@/hooks/useFormatters";
import { usePlannerCities } from "@/hooks/usePlannerCities";
import { KiriStage } from "./KiriStage";
import { safeRedirectTarget } from "@/utils/safeRedirect";

const HEADING_ID = "ask-headline";

/**
 * The query string, read from the browser: `useSearchParams` would keep this
 * page out of the prerendered HTML. It cannot change without a navigation, so
 * there is nothing to subscribe to.
 */
const subscribeToSearch = () => () => {};
const searchSnapshot = () => window.location.search;
const searchServerSnapshot = () => "";

/** The planner, opened with what was typed. */
export function plannerHref(ask: string): string {
  return `/plan/?q=${encodeURIComponent(ask)}`;
}

/**
 * The line naming the cities `ai_api` covers. The list needs a session, so it
 * is fetched only once there is one; until then, or when it fails, the copy's own list shows.
 */
function CitiesHint({ live }: { live: boolean }) {
  const { t } = useLanguage();
  if (!live) return <>{interpolate(t.landing.cities, { cities: t.landing.citiesFallback })}</>;
  return <LiveCities />;
}

function LiveCities() {
  const { t } = useLanguage();
  const { formatList } = useFormatters();
  const { cities, status } = usePlannerCities();
  const names =
    status === "ready" && cities.length > 0
      ? formatList(cities.map((city) => city.name))
      : t.landing.citiesFallback;
  return <>{interpolate(t.landing.cities, { cities: names })}</>;
}

/**
 * The landing's ask: `AskComposer` plus signing in. Signed out, sending opens the
 * sign-in dialog with `/plan/?q=…` as its redirect, so the ask survives the round
 * trip; arriving with the route guard's `?redirect=` opens the dialog at once.
 */
export function AskField() {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuth();

  // `null` until something is pressed: the dialog then follows the guard's `?redirect=` alone
  const [login, setLogin] = useState<{
    open: boolean;
    redirect: string | null;
  } | null>(null);

  // `URLSearchParams` decodes the guard's value exactly once, right for a path whose query holds an ask
  const search = useSyncExternalStore(
    subscribeToSearch,
    searchSnapshot,
    searchServerSnapshot
  );
  const sentHere =
    !isLoading && !isAuthenticated
      ? safeRedirectTarget(new URLSearchParams(search).get("redirect"))
      : null;

  // what Kiri reacts to
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loginOpen = login ? login.open : sentHere !== null;
  const loginRedirect = login?.redirect ?? sentHere;

  /** Signed out, returns `null` so the composer does not fade behind a dialog the reader may close. */
  const submit = (ask: string): string | null => {
    const href = plannerHref(ask);
    if (isAuthenticated) {
      setLeaving(true);
      return href;
    }
    setLogin({ open: true, redirect: href });
    return null;
  };

  return (
    <section className="flex flex-1 flex-col overflow-x-clip pt-(--header-h)">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <AskComposer
          onSubmit={submit}
          labelledBy={HEADING_ID}
          hint={<CitiesHint live={isAuthenticated} />}
          onFocusChange={setFocused}
          onAskChange={(ask) => setTyped(ask.trim().length > 0)}
        >
          <h1
            id={HEADING_ID}
            className="mb-7 text-center text-[clamp(2.5rem,9vw,4.125rem)] leading-[1.05] font-light text-text-primary sm:mb-8"
          >
            {t.landing.headline}
          </h1>
        </AskComposer>
      </div>

      <KiriStage listening={focused} noting={focused && typed} leaving={leaving} />

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
