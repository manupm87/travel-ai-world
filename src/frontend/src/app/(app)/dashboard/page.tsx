"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useLanguage } from "@/context/LanguageContext";

/**
 * `/dashboard/` is now the planner (TRA-196): trips are listed, opened,
 * renamed and deleted there, so this route stays only to keep old links and
 * bookmarks working, and hands the browser straight on to `/plan/`.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    router.replace("/plan/");
  }, [router]);

  return <LoadingSpinner label={t.plan.trips.redirecting} />;
}
