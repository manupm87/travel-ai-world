"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Client-side redirect for authenticated users on the landing page.
 */
export default function LandingRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isHome = searchParams.get("home") === "true";

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isHome) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router, isHome]);

  return null;
}
