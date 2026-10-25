"use client";

/** Finishes a Cognito sign-in on `/auth/callback/`. */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { safeRedirectTarget } from "@/utils/safeRedirect";

/**
 * Finishes a Cognito sign-in: exchanges the code for a session and continues to
 * the page the user wanted, or `/dashboard/`. The exchange runs once, even under
 * React's development double effect, because a code is single-use.
 */
export function AuthCallback() {
  const { completeLogin } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeLogin(searchParams)
      // checked again on the way out: the pending login sat in storage
      .then((redirect) => router.replace(safeRedirectTarget(redirect) ?? "/dashboard/"))
      .catch(() => setFailed(true));
  }, [completeLogin, router, searchParams]);

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-6 pt-(--header-h) text-center">
      {failed ? (
        <div
          role="alert"
          className="w-full max-w-[28rem] rounded-2xl border border-glass-border bg-glass-bg p-8 backdrop-blur-xl"
        >
          <p className="text-[15px] leading-relaxed text-text-primary">
            {t.auth.callbackError}
          </p>
          <Button href="/" size="sm" className="mt-6 rounded-full px-6 py-3">
            {t.auth.backHome}
          </Button>
        </div>
      ) : (
        <LoadingSpinner label={t.auth.completingSignIn} />
      )}
    </Container>
  );
}
