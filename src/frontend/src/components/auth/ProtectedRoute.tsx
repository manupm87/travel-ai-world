"use client";

/** The route guard of the signed-in and admin routes. */

import { useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { NoAccess } from "./NoAccess";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Sends a signed-out visitor home and shows `NoAccess` once core_api answers
 * "not invited". While that answer is unknown the page renders: the backend refuses anyway.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, access } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // the query string is part of the destination: the planner's `?trip=` lives there
      router.push(`/?redirect=${encodeURIComponent(pathname + window.location.search)}`);
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (access === "denied") return <NoAccess />;

  return <>{children}</>;
}
