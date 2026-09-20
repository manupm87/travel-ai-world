"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useLanguage } from "@/context/LanguageContext";
import { isTripId } from "@/hooks/useTrip";

/**
 * The old trip viewer's query, forwarded to the planner: a trip is read and
 * changed in the same place it was planned now (TRA-196). An id that is not a
 * trip id goes to the planner's own front door rather than to a page that
 * would only say "not found".
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
