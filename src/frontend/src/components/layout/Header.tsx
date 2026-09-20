"use client";

import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
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
  variant?: "landing" | "dashboard";
}

/**
 * Global navigation.
 *
 * Quiet by design: the wordmark, one action, and — once signed in — the
 * account menu. There are no links: the landing is one field and there is
 * nowhere else to go. On the marketing pages language and theme live in the footer,
 * so the top of the page holds nothing that competes with what you came to
 * type. The signed-in shell (`app/(app)/layout.tsx`) has no footer, so there
 * the two controls stay in the bar on desktop and in the drawer on small
 * viewports — they are the reader's own and must be reachable everywhere.
 * Scrolling turns the bar to glass instead of hiding the aurora behind an
 * opaque block.
 *
 * @param variant - `dashboard` carries language and theme in the bar, because
 *   the signed-in shell has no footer to put them in; `landing` does not.
 */
export default function Header({ variant = "landing" }: HeaderProps) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const scrolled = useScrolled();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = () => setLoginOpen(true);

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
            {variant === "dashboard" && (
              <span className="hidden md:flex items-center gap-3">
                <LanguageSwitcher />
                <ThemeToggle />
              </span>
            )}

            {isAuthenticated ? (
              <Button href="/plan/" size="sm">
                {t.nav.openPlanner}
              </Button>
            ) : (
              <Button size="sm" onClick={openLogin}>
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
