"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Plus, ShieldCheck, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n/interpolate";
import { useDialog } from "@/hooks/useDialog";
import { useTrips } from "@/hooks/useTrips";
import { Kiri } from "@/components/kiri/Kiri";
import { stickerCities } from "@/utils/suitcase";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export const MOBILE_DRAWER_ID = "mobile-drawer";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}

/** The signed-in home, where the trips are listed. */
const HOME = "/dashboard/";

function samePath(a: string | null, b: string): boolean {
  return (a ?? "").replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/**
 * "Your suitcase — 3 trips, 3 stickers": Kiri wearing a sticker for every
 * city the account has been to. Mounted only while the menu is open, so the
 * trips are asked for when someone looks, not on every page.
 */
function SuitcaseCard({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useLanguage();
  const { trips, status } = useTrips();
  if (status !== "ready" || trips.length === 0) return null;

  const stickers = stickerCities(trips).length;
  const count =
    trips.length === 1 && stickers === 1
      ? t.nav.suitcaseCountOne
      : interpolate(t.nav.suitcaseCount, { trips: trips.length, stickers });

  return (
    <Link
      href={HOME}
      onClick={onNavigate}
      className="flex items-center gap-4 rounded-2xl border border-glass-border px-4 py-3.5 transition-colors hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <Kiri state="stickers" scale={3} />
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold text-text-primary">{t.nav.suitcase}</span>
        <span className="text-[13px] text-text-secondary">{count}</span>
      </span>
    </Link>
  );
}

/**
 * The phone menu (TRA-236): a sheet from the right over the dimmed page.
 * The two places — the trips and a new trip —, the language and the theme as
 * side-by-side choices, and at the bottom Kiri's suitcase and the account.
 *
 * It stays mounted so the slide can run, but while closed it is `inert` and
 * hidden from assistive technology. Open, it keeps the dialog contract
 * (`useDialog`): focus in, Tab trapped, Escape and the backdrop close it.
 */
export function MobileDrawer({ open, onClose, onLogin }: MobileDrawerProps) {
  const { t } = useLanguage();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useDialog<HTMLDivElement>({ open, onEscape: onClose, lockScroll: true });

  const login = () => {
    onClose();
    onLogin();
  };

  const signOut = () => {
    onClose();
    logout();
    router.push("/");
  };

  const navItem = (active: boolean) =>
    cn(
      "flex h-12 items-center gap-3 rounded-2xl px-4 text-[17px] font-medium text-text-primary transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      active ? "bg-bg-surface" : "hover:bg-bg-surface/60"
    );

  return (
    <div
      id={MOBILE_DRAWER_ID}
      role="dialog"
      aria-modal={open || undefined}
      aria-label={t.nav.menu}
      aria-hidden={!open}
      inert={!open}
      className={cn("fixed inset-0 z-[60] md:hidden", !open && "pointer-events-none")}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/55 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col rounded-l-3xl border-l border-glass-border bg-bg-secondary px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="mb-6 flex items-center justify-between pl-1">
          <Logo onClick={onClose} />
          <button
            type="button"
            onClick={onClose}
            aria-label={t.nav.closeMenu}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-primary transition-colors hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        {isAuthenticated ? (
          <nav className="flex flex-col gap-1">
            <Link href={HOME} onClick={onClose} className={navItem(samePath(pathname, HOME))}>
              <Briefcase size={18} aria-hidden="true" />
              {t.nav.trips}
            </Link>
            <Link href="/plan/" onClick={onClose} className={navItem(samePath(pathname, "/plan/"))}>
              <Plus size={18} aria-hidden="true" />
              {t.nav.planTrip}
            </Link>
            {isAdmin && (
              <Link href="/admin/" onClick={onClose} className={navItem(false)}>
                <ShieldCheck size={18} aria-hidden="true" />
                {t.nav.admin}
              </Link>
            )}
          </nav>
        ) : (
          <Button onClick={login} className="h-12 w-full rounded-2xl py-0 text-[15px] font-semibold">
            {t.auth.login}
          </Button>
        )}

        <div className="my-5 border-t border-glass-border" />

        <p className="mb-2 pl-1 text-[13px] text-text-secondary">{t.nav.language}</p>
        <LanguageSwitcher variant="segmented" />

        <p className="mt-5 mb-2 pl-1 text-[13px] text-text-secondary">{t.theme.label}</p>
        <ThemeToggle variant="segmented" />

        {isAuthenticated && (
          <div className="mt-auto flex flex-col gap-4 pt-6">
            {open && <SuitcaseCard onNavigate={onClose} />}
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                {user?.picture ? (
                  <Image
                    src={user.picture}
                    alt=""
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-surface text-accent"
                  >
                    <UserIcon size={18} />
                  </span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-text-primary">
                    {t.nav.account}
                  </span>
                  {user?.email && (
                    <span className="truncate text-xs text-text-secondary">{user.email}</span>
                  )}
                </span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="h-10 shrink-0 rounded-full border border-glass-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t.auth.logout}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
