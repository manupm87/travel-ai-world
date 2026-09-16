"use client";

import { useSearchParams } from "next/navigation";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import AIInsights from "@/components/trip-viewer/AIInsights";
import InteractiveTimeline from "@/components/trip-viewer/InteractiveTimeline";
import TripOverview from "@/components/trip-viewer/TripOverview";
import Itinerary from "@/components/trip-viewer/itinerary";
import TripHeader from "@/components/trip-viewer/trip-header";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { useLanguage } from "@/context/LanguageContext";
import { useTrip } from "@/hooks/useTrip";

/**
 * The trip viewer's client side (`/trip/?id=<uuid>`): reads the id from the
 * query string and renders one of four states from `useTrip` (loading,
 * not-found, error, ready). The data and its state machine live in the hook;
 * the trip-viewer sections only ever see the `Trip` view model. The shell and
 * the auth guard come from the `(app)` layout.
 */
export default function TripClientPage() {
  const { t } = useLanguage();
  const id = useSearchParams().get("id");
  const { trip, status, reload } = useTrip(id);
  const tv = t.tripViewer;

  return (
    <>
      {status === "loading" && (
        <Section variant="transparent" padding="xlarge">
          <LoadingSpinner label={tv.loading} />
        </Section>
      )}

      {status === "not-found" && (
        <Section variant="transparent" padding="xlarge">
          <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
            <div className="text-4xl mb-6" aria-hidden="true">
              ✈️
            </div>
            <h1 className="text-3xl md:text-4xl font-medium text-text-primary mb-3 tracking-tight">
              {tv.notFoundTitle}
            </h1>
            <p className="text-text-secondary text-lg max-w-[480px] mb-8 leading-relaxed">
              {tv.notFoundDescription}
            </p>
            <Button href="/dashboard/" variant="primary">
              {tv.backToDashboard}
            </Button>
          </div>
        </Section>
      )}

      {status === "error" && (
        <Section variant="transparent" padding="xlarge">
          <div
            role="alert"
            className="flex flex-col items-center justify-center py-12 px-8 text-center"
          >
            <h1 className="text-3xl md:text-4xl font-medium text-text-primary mb-3 tracking-tight">
              {tv.errorTitle}
            </h1>
            <p className="text-text-secondary text-lg max-w-[480px] mb-8 leading-relaxed">
              {tv.errorDescription}
            </p>
            <Button variant="secondary" onClick={reload}>
              {tv.retry}
            </Button>
          </div>
        </Section>
      )}

      {status === "ready" && trip && (
        <div className="flex flex-col pb-20">
          <TripHeader trip={trip} />
          <InteractiveTimeline trip={trip} />
          <TripOverview trip={trip} />
          <AIInsights trip={trip} />
          <Itinerary trip={trip} />
        </div>
      )}
    </>
  );
}
