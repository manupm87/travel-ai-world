"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
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
import { MarketingNav } from "./MarketingNav";
import { MobileDrawer, MOBILE_DRAWER_ID } from "./MobileDrawer";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  variant?: "landing" | "dashboard";
}

/**
 * Global Navigation Header.
 *
 * Composes the brand, marketing links, theme and language switchers, the
 * primary CTA and the user menu, plus the mobile drawer and the login modal.
 *
 * @param variant - `landing` shows the marketing links; `dashboard` hides them.
 */
export default function Header({ variant = "landing" }: HeaderProps) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const scrolled = useScrolled();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = () => setLoginOpen(true);
  const ctaHref = isAuthenticated ? "/dashboard" : "#planner";
  const ctaLabel = isAuthenticated ? t.nav.dashboard : t.nav.planMyTrip;

  return (
    <>
      <header
        data-scrolled={scrolled}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-bg-primary/95 backdrop-blur-md border-b border-border"
            : "bg-transparent"
        )}
      >
        <Container className="px-6 md:px-8 h-(--header-h) flex items-center justify-between gap-4">
          <Logo />

          {variant === "landing" && <MarketingNav />}

          <div className="flex-1 hidden lg:block" />

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-4 lg:gap-6">
            <ThemeToggle />
            <LanguageSwitcher />
            <Button href={ctaHref} size="sm">
              {ctaLabel}
            </Button>
            <UserMenu onLogin={openLogin} />
          </div>

          {/* Mobile actions */}
          <div className="flex md:hidden items-center gap-3">
            <Link
              href={ctaHref}
              className="bg-accent hover:bg-accent-hover transition-colors text-white text-[10px] font-medium px-3 py-1.5 rounded-md uppercase tracking-wider"
            >
              {ctaLabel}
            </Link>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t.nav.openMenu}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls={MOBILE_DRAWER_ID}
              className="p-2 text-text-primary hover:bg-bg-surface rounded-lg transition-colors flex items-center justify-center"
            >
              <Menu size={24} aria-hidden="true" />
            </button>
          </div>
        </Container>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant={variant}
        onLogin={openLogin}
      />

      <Suspense fallback={null}>
        <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      </Suspense>
    </>
  );
}
