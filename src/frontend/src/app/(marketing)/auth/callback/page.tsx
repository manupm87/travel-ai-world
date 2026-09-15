import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { AuthCallback } from "@/components/auth/AuthCallback";

/**
 * Where the Cognito managed login sends the browser back with `?code&state`.
 * `useSearchParams` needs a Suspense boundary in a static export.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AuthCallback />
    </Suspense>
  );
}
