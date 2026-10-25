"use client";

/** Forwards the old `/trip/?id=` links to the planner. */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useLanguage } from "@/context/LanguageContext";
import { isTripId } from "@/hooks/useTrip";

/**
 * Forwards `/trip/?id=` to the planner, where saved trips open.
 * A malformed id goes to a bare `/plan/` rather than to a "not found".
 */
export default function TripRedirect() {
  const router = useRouter();
  const { t } = useLanguage();
  const id = useSearchParams().get("id");

  useEffect(() => {
    router.replace(isTripId(id) ? `/plan/?trip=${encodeURIComponent(id)}` : "/plan/");
  }, [id, router]);

  return <LoadingSpinner label={t.plan.trips.redirecting} />;
}
