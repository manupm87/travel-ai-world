"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import type { Translations } from "@/i18n/types";
import { useScrolled } from "@/hooks/useScrolled";
import { LoginModal } from "@/components/auth/LoginModal";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { cn } from "@/utils/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { MobileDrawer, MOBILE_DRAWER_ID } from "./MobileDrawer";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  variant?: "landing" | "app";
}

/** The signed-in home, where the account's trips are listed. */
const HOME = "/dashboard/";

/**
 * The pill's one action, which is always "the other place": the home sends
 * you to the planner, and everywhere else — the planner included, which no
 * longer lists any trips (TRA-201) — sends you to the trips.
 */
function pill(pathname: string | null, t: Translations) {
  const onHome = (pathname ?? "/").replace(/\/+$/, "") === HOME.replace(/\/+$/, "");
  return onHome
    ? { href: "/plan/", label: t.nav.openPlanner, short: t.nav.plannerShort }
    : { href: HOME, label: t.nav.trips, short: t.nav.tripsShort };
}

/**
 * Global navigation.
 *
 * Quiet by design: the wordmark, one action, and — once signed in — the
 * account menu. There are no links: the landing is one field and there is
 * nowhere else to go. The one action is always the other place (TRA-201):
 * the trips on the home, the planner everywhere else — which is how a
 * traveller leaves a planner that no longer lists a single trip.
 * On the marketing pages language and theme live in the footer,
 * so the top of the page holds nothing that competes with what you came to
 * type. The signed-in shell (`app/(app)/layout.tsx`) has no footer, so there
 * the two controls stay in the bar on desktop and in the drawer on small
 * viewports — they are the reader's own and must be reachable everywhere.
 * Scrolling turns the bar to glass instead of hiding the aurora behind an
 * opaque block.
 *
 * @param variant - `app` carries language and theme in the bar, because
 *   the signed-in shell has no footer to put them in; `landing` does not.
 */
export default function Header({ variant = "landing" }: HeaderProps) {
  const { t } = useLanguage();
  const { isAuthenticated, isAdmin } = useAuth();
  const pathname = usePathname();
  const scrolled = useScrolled();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = () => setLoginOpen(true);
  const action = pill(pathname, t);

  return (
    <>
      <header
        data-scrolled={scrolled}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-glass-bg backdrop-blur-xl border-b border-glass-border"
            : "bg-transparent"
        )}
      >
        <Container className="px-6 md:px-8 h-(--header-h) flex items-center justify-between gap-4">
          <Logo />

          <div className="flex-1" />

          <div className="flex items-center gap-3 md:gap-4">
            {isAuthenticated && isAdmin && (
              /* Only an administrator ever sees the way in (TRA-222); on a
                 phone it lives in the drawer. */
              <Link
                href="/admin/"
                className="hidden md:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                {t.nav.admin}
              </Link>
            )}
            {variant === "app" && (
              <span className="hidden md:flex items-center gap-3">
                <LanguageSwitcher />
                <ThemeToggle />
              </span>
            )}

            {isAuthenticated ? (
              /* Next to the burger on a 390 px screen "Open the planner"
                 wrapped to two lines (TRA-193): below `sm` the pill says the
                 one word, while the accessible name stays the full action. */
              <Button
                href={action.href}
                size="sm"
                aria-label={action.label}
                className="whitespace-nowrap"
              >
                <span className="sm:hidden">{action.short}</span>
                <span className="hidden sm:inline">{action.label}</span>
              </Button>
            ) : (
              <Button size="sm" onClick={openLogin} className="whitespace-nowrap">
                {t.auth.login}
              </Button>
            )}

            {isAuthenticated && (
              <span className="hidden md:block">
                <UserMenu onLogin={openLogin} />
              </span>
            )}

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t.nav.openMenu}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls={MOBILE_DRAWER_ID}
              className="md:hidden p-2 text-text-primary hover:bg-bg-surface rounded-lg transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Menu size={24} aria-hidden="true" />
            </button>
          </div>
        </Container>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onLogin={openLogin}
      />

      <Suspense fallback={null}>
        <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      </Suspense>
    </>
  );
}
