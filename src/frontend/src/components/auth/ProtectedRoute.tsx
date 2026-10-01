"use client";

import { useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { NoAccess } from "./NoAccess";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * A wrapper component that protects routes from unauthenticated access, and
 * tells a signed-in account that is not on the access list so (TRA-257):
 * `NoAccess` replaces the page once core_api has answered "not invited".
 * While that answer is unknown the page renders — the backend refuses anyway.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, access } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to home, remembering where to come back to. The query string
      // is part of the destination: the planner's `?trip=` lives there.
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
    return null; // Will redirect via useEffect
  }

  if (access === "denied") return <NoAccess />;

  return <>{children}</>;
}
