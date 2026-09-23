"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { AdminShell } from "./AdminShell";

/** What any `/admin/` URL shows an account that is not an administrator. */
export function NotAllowed() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div
        data-testid="admin-not-allowed"
        className="w-full max-w-md rounded-2xl border border-border-card bg-bg-card p-8 text-center"
      >
        <ShieldAlert size={28} aria-hidden="true" className="mx-auto text-text-secondary" />
        <h1 className="mt-4 text-2xl text-text-primary">{t.admin.gate.title}</h1>
        <p className="mt-2 text-text-secondary">{t.admin.gate.description}</p>
        <Button href="/dashboard/" size="sm" className="mt-6">
          {t.admin.gate.back}
        </Button>
      </div>
    </div>
  );
}

/**
 * The console's door (TRA-222): a spinner while the session is being read,
 * `NotAllowed` for anyone whose account is not an administrator, the shell
 * for everyone else. The services refuse a non-admin with 403 anyway; this
 * only keeps the page from pretending otherwise.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAdmin) return <NotAllowed />;

  return <AdminShell>{children}</AdminShell>;
}
