"use client";

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

/**
 * "For now: Budapest, Bologna and Berlin" — the cities `ai_api` covers. The
 * list needs a session, so it is asked for only once there is one; until then,
 * and whenever it cannot be had, the line says the copy's own three.
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
 * The landing page: one question, one field, one action — and Kiri, who rolls
 * in under the field and waits for the traveller to say where (TRA-236).
 *
 * Everything the site asks of a first-time reader is here — a sentence about
 * the trip they already have in mind. The field itself is `AskComposer`, the
 * same one the signed-in home offers; what this component adds is signing in.
 *
 * Signed in, sending opens `/plan/?q=…`. Signed out, the same press opens the
 * sign-in dialog with that exact path as its redirect, so the ask survives the
 * Cognito round-trip (the pending login carries it) and the Google one (the
 * modal navigates there itself). Arriving with `?redirect=` — the route guard
 * sent someone here from a signed-in page — opens the dialog straight away.
 */
export function AskField() {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuth();

  // `null` while nothing has been pressed: the dialog then answers to the
  // guard's `?redirect=` alone, and closing it is a decision of its own.
  const [login, setLogin] = useState<{
    open: boolean;
    redirect: string | null;
  } | null>(null);

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

  // What Kiri reacts to: the field's focus, whether anything is typed, and
  // the ask leaving for the planner.
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loginOpen = login ? login.open : sentHere !== null;
  const loginRedirect = login?.redirect ?? sentHere;

  /**
   * Signed in, the ask is a navigation. Signed out, it becomes the dialog's
   * redirect and the field stays as it is — hence the `null`, which keeps the
   * composer from fading out behind a dialog the reader may close.
   */
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
