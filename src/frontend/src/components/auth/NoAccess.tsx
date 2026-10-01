"use client";

import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";

/**
 * What a signed-in account sees when it is not on the access list (TRA-257):
 * which account it is, what to do about it, and a way out. It replaces every
 * protected page, so the person never meets a wall of failed requests.
 */
export function NoAccess() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const router = useRouter();
  const copy = t.auth.noAccess;

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
        <h1 className="mt-4 text-2xl text-text-primary">{copy.title}</h1>
        <p className="mt-2 break-words text-text-secondary">
          {interpolate(copy.description, { email: user?.email ?? "" })}
        </p>
        <p className="mt-2 text-sm text-text-secondary">{copy.hint}</p>
        <Button size="sm" variant="secondary" onClick={signOut} className="mt-6">
          {copy.signOut}
        </Button>
      </div>
    </div>
  );
}
