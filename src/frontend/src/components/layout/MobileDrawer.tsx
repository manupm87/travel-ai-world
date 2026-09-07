"use client";

import { X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { MarketingNav } from "./MarketingNav";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export const MOBILE_DRAWER_ID = "mobile-drawer";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  variant: "landing" | "dashboard";
  onLogin: () => void;
}

/**
 * Full-screen navigation for small viewports. It stays mounted so the slide
 * transition can run, but while closed it is `inert` and hidden from
 * assistive technology, so nothing inside is focusable or announced.
 */
export function MobileDrawer({ open, onClose, variant, onLogin }: MobileDrawerProps) {
  const { t } = useLanguage();

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

        <div className="mb-auto">
          {variant === "landing" && <MarketingNav variant="drawer" onNavigate={onClose} />}
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <UserMenu variant="inline" onLogin={onLogin} onAfterAction={onClose} />
        </div>

        <div className="mt-auto pt-8 border-t border-border">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-secondary uppercase tracking-widest font-medium">
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
