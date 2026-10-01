"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";

/**
 * What a signed-in account sees when it is not on the access list (TRA-257):
 * which account it is, what to do about it, a way to ask again once someone
 * has invited it, and a way out. It replaces every protected page, so the
 * person never meets a wall of failed requests — and the heading takes the
 * focus, because the page they asked for never came.
 */
export function NoAccess() {
  const { t } = useLanguage();
  const { user, logout, refreshAccess } = useAuth();
  const router = useRouter();
  const copy = t.auth.noAccess;
  const email = user?.email ?? "";

  const headingRef = useRef<HTMLHeadingElement>(null);
  const [checking, setChecking] = useState(false);
  const [stillDenied, setStillDenied] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    headingRef.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);

  // An answer of "allowed" unmounts this page; still being here means "no".
  const checkAgain = async () => {
    setChecking(true);
    setStillDenied(false);
    try {
      await refreshAccess();
    } finally {
      if (mounted.current) {
        setChecking(false);
        setStillDenied(true);
      }
    }
  };

  const signOut = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div
        data-testid="no-access"
        className="w-full max-w-md rounded-2xl border border-border-card bg-bg-card p-8 text-center"
      >
        <KeyRound size={28} aria-hidden="true" className="mx-auto text-text-secondary" />
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl text-text-primary focus:outline-none">
          {copy.title}
        </h1>
        <p className="mt-2 break-words text-text-secondary">{interpolate(copy.description, { email })}</p>
        <p className="mt-2 text-sm text-text-secondary">{copy.hint}</p>
        <p role="status" className="mt-2 min-h-5 break-words text-sm text-text-secondary">
          {stillDenied && !checking ? interpolate(copy.stillDenied, { email }) : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button size="sm" onClick={checkAgain} disabled={checking} aria-busy={checking}>
            {checking ? copy.checking : copy.checkAgain}
          </Button>
          <Button size="sm" variant="secondary" onClick={signOut}>
            {copy.signOut}
          </Button>
        </div>
      </div>
    </div>
  );
}
