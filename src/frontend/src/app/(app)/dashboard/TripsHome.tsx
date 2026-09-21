"use client";

import { AskComposer } from "@/components/common/AskComposer";
import { TripsList } from "@/components/planner/v2/TripsList";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { useLanguage } from "@/context/LanguageContext";
import { plannerHref } from "@/components/landing/AskField";

const HEADING_ID = "trips-home-headline";

/** The trips section settles in just behind the field above it. */
const TRIPS_DELAY_MS = 80;

/**
 * The signed-in home (`/dashboard/`, TRA-199): ask for the next trip, or open
 * one you already have.
 *
 * Two things, in the order they are wanted. The field is the landing's, the
 * very same `AskComposer`, because the question does not change once you have
 * an account — sending it opens the planner with the ask, and the fade carries
 * across. Under it, the account's trips as the planner lists them
 * (`TripsList`, grouped by phase), each card opening in the planner; a trip
 * that is over opens read-only, which is the planner's own rule (ADR 0019),
 * not something this page decides.
 *
 * The reader is signed in — the group's layout guards every route in it — so
 * the press is a navigation and never a sign-in dialog.
 */
export default function TripsHome() {
  const { t } = useLanguage();
  const l = t.plan.trips;

  return (
    <Container className="px-4 py-12 sm:px-6 sm:py-16 lg:px-16">
      <AskComposer onSubmit={plannerHref} labelledBy={HEADING_ID}>
        <h1
          id={HEADING_ID}
          className="mb-7 text-center text-[clamp(2rem,7vw,3.25rem)] leading-[1.05] font-light text-text-primary"
        >
          {t.dashboard.headline}
        </h1>
      </AskComposer>

      <section
        className="mt-14 animate-fade-up sm:mt-20"
        style={{ animationDelay: `${TRIPS_DELAY_MS}ms` }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-light text-text-primary">{l.title}</h2>
          <Button href="/plan/" variant="glass" size="sm" className="rounded-full">
            {l.newTrip}
          </Button>
        </div>

        <TripsList />
      </section>
    </Container>
  );
}
