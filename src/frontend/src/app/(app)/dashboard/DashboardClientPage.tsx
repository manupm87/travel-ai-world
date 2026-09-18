"use client";

import { Sparkles } from "lucide-react";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import PlannerCard from "@/components/planner/PlannerCard";
import { TripSection } from "@/components/dashboard/TripSection";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { useLanguage } from "@/context/LanguageContext";
import { useTrips } from "@/hooks/useTrips";
import { TRIP_STATUSES } from "@/types/trip-summary";

/** Section order on the dashboard: upcoming first, then drafts, then history. */
const SECTION_ORDER = ["planned", "planning", "finished"] as const satisfies readonly (typeof TRIP_STATUSES)[number][];

/**
 * The dashboard's client side: the planner on top, then the user's trips
 * from core_api in one of four states (loading, error, empty, ready).
 * The data and its state machine live in `useTrips`; this component only
 * picks what to render and translates the copy.
 */
export default function DashboardClientPage() {
  const { t } = useLanguage();
  const { trips, status, reload } = useTrips();

  return (
    <>
      <Section variant="transparent" padding="small" className="pt-10">
        <Button href="/plan/" size="sm" className="self-start">
          <Sparkles size={14} aria-hidden="true" className="mr-2" />
          {t.plan.openPlanner}
        </Button>
      </Section>

      <PlannerCard transparent />

      {status === "loading" && (
        <Section variant="transparent" padding="xlarge">
          <LoadingSpinner label={t.dashboard.loading} />
        </Section>
      )}

      {status === "error" && (
        <Section variant="transparent" padding="xlarge">
          <div
            role="alert"
            className="flex flex-col items-center justify-center py-12 px-8 text-center"
          >
            <h2 className="text-2xl font-medium text-text-primary mb-3 tracking-tight">
              {t.dashboard.errorTitle}
            </h2>
            <p className="text-text-secondary text-lg max-w-[480px] mb-8 leading-relaxed">
              {t.dashboard.errorDescription}
            </p>
            <Button variant="secondary" onClick={reload}>
              {t.dashboard.retry}
            </Button>
          </div>
        </Section>
      )}

      {status === "ready" &&
        (trips.length === 0 ? (
          <EmptyDashboard />
        ) : (
          SECTION_ORDER.map((sectionStatus) => (
            <TripSection
              key={sectionStatus}
              title={t.dashboard.sections[sectionStatus]}
              trips={trips.filter((trip) => trip.status === sectionStatus)}
              transparent={sectionStatus === "planning"}
            />
          ))
        ))}
    </>
  );
}
