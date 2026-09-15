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
        <>
          <p role="alert" className="text-error">
            {t.auth.callbackError}
          </p>
          <Button href="/" size="sm">
            {t.auth.backHome}
          </Button>
        </>
      ) : (
        <>
          <LoadingSpinner />
          <p className="text-text-secondary text-sm">{t.auth.completingSignIn}</p>
        </>
      )}
    </Container>
  );
}
