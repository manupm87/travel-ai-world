"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

/**
 * Finishes a Cognito sign-in: exchanges the code in the query for a session
 * and continues to the page the user wanted. The exchange runs once, even
 * under React's development double-effect: a code is single-use.
 *
 * Nothing here is a decision the reader makes, so the page stays quiet — the
 * spinner and one line — until the exchange fails, and then it says so and
 * offers the way back (TRA-193).
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
      .then((redirect) => router.replace(redirect ?? "/dashboard"))
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
