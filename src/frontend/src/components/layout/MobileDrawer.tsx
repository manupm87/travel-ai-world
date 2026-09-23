"use client";

import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export const MOBILE_DRAWER_ID = "mobile-drawer";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}

/**
 * What the header cannot fit on a phone: the account, the language and the
 * theme. It stays mounted so the slide transition can run, but while closed it
 * is `inert` and hidden from assistive technology, so nothing inside is
 * focusable or announced.
 */
export function MobileDrawer({ open, onClose, onLogin }: MobileDrawerProps) {
  const { t } = useLanguage();
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <div
      id={MOBILE_DRAWER_ID}
      role="dialog"
      aria-modal={open || undefined}
      aria-label={t.nav.menu}
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-0 z-[60] bg-bg-primary transition-all duration-500 md:hidden",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex flex-col h-full px-6 py-8">
        <div className="flex items-center justify-between mb-12">
          <Logo onClick={onClose} />
          <button
            type="button"
            onClick={onClose}
            aria-label={t.nav.closeMenu}
            className="p-2 text-text-primary hover:bg-bg-surface rounded-lg transition-colors flex items-center justify-center"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>

        <UserMenu variant="inline" onLogin={onLogin} onAfterAction={onClose} />

        {isAuthenticated && isAdmin && (
          <Link
            href="/admin/"
            onClick={onClose}
            className="mt-4 flex items-center gap-3 rounded-lg px-3 py-3 text-text-primary hover:bg-bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <ShieldCheck size={20} aria-hidden="true" />
            {t.nav.admin}
          </Link>
        )}

        <div className="mt-auto pt-8 border-t border-border">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-secondary font-medium">
              {t.nav.selectLanguage}
            </p>
            <ThemeToggle variant="labeled" />
          </div>
          <LanguageSwitcher variant="segmented" />
        </div>
      </div>
    </div>
  );
}
