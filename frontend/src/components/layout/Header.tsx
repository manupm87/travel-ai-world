"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { LoginModal } from "@/components/auth/LoginModal";
import { Button } from "@/components/ui/Button";
import { Menu, X, LogOut, User as UserIcon } from "lucide-react";
import type { Language } from "@/i18n";

const FLAG: Record<Language, string> = { en: "🇬🇧", es: "🇪🇸" };

interface HeaderProps {
  variant?: "landing" | "dashboard";
}



/**
 * Global Navigation Header.
 * 
 * Renders the top navigation bar containing the branding, main navigation links,
 * the language switcher, and primary call-to-actions.
 * 
 * @param variant - Controls the appearance and links shown. `landing` shows scroll-reveals 
 * and marketing links. `dashboard` is static and removes marketing links.
 */
export default function Header({ variant = "landing" }: HeaderProps) {
  const { t, language, setLanguage } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);


  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-bg-primary/95 backdrop-blur-md border-b border-border"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-[1440px] w-full mx-auto px-6 md:px-8 lg:px-16 h-[72px] flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-accent flex items-center justify-center text-lg">
              ✈
            </div>
            <span className="text-white font-medium text-xs md:text-sm lg:text-base tracking-[2px] uppercase whitespace-nowrap">
              Travel AI World
            </span>
          </Link>

          {/* Desktop Nav */}
          {variant === "landing" && (
            <nav className="hidden lg:flex items-center gap-8">
              <a href="#how-it-works" className="text-text-secondary text-sm hover:text-white transition-colors">
                {t.nav.howItWorks}
              </a>
              <a href="#features" className="text-text-secondary text-sm hover:text-white transition-colors">
                {t.nav.features}
              </a>
              <a href="#testimonials" className="text-text-secondary text-sm hover:text-white transition-colors">
                {t.nav.reviews}
              </a>
            </nav>
          )}

          <div className="flex-1 hidden lg:block" />

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4 lg:gap-6">
            {/* Language switcher (Segmented Control) */}
            <div className="flex items-center gap-1 bg-white/5 border border-border-soft rounded-xl p-1 relative">
              {(["en", "es"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-300 cursor-pointer overflow-hidden group ${
                    language === lang
                      ? "text-white active-lang"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  {language === lang && (
                    <div className="absolute inset-0 bg-accent shadow-[0_0_15px_rgba(79,110,247,0.4)] z-0" />
                  )}
                  <span className="relative z-10">{FLAG[lang]}</span>
                  <span className="relative z-10 uppercase tracking-wider">{lang}</span>
                </button>
              ))}
            </div>

            {/* Dashboard / Home Link */}
            {isAuthenticated && (
              <Link
                href="/dashboard"
                className={`text-sm font-medium transition-colors nav-link ${
                  variant === "dashboard" ? "active-nav" : "text-text-secondary hover:text-white"
                }`}
              >
                {t.nav.myDashboard}
              </Link>
            )}

            <Link
              href="/"
              className={`text-sm font-medium transition-colors nav-link ${
                variant === "landing" ? "text-text-secondary hover:text-white" : "text-text-secondary hover:text-white"
              }`}
            >
              {t.nav.home}
            </Link>

            {/* Auth Actions */}
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <div className="flex items-center gap-3 bg-white/5 border border-border-soft rounded-full pl-1 pr-1 py-1 group transition-all hover:bg-white/10 hover:border-accent/30">
                  <div className="flex items-center gap-2.5 pl-2 pr-1">
                    {user?.picture ? (
                      <img 
                        src={user.picture} 
                        alt={user.name} 
                        className="w-7 h-7 rounded-full object-cover border border-accent/30"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                        <UserIcon size={14} />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-[12px] font-semibold text-white leading-none">
                        {user?.name.split(' ')[0]}
                      </span>
                      <span className="text-[10px] text-text-secondary leading-tight mt-0.5">
                        {t.auth.loggedIn || "Logged In"}
                      </span>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-border-soft mx-1" />
                  <button 
                    onClick={logout}
                    className="p-2 text-text-secondary hover:text-error transition-colors rounded-full hover:bg-error/10"
                    title={t.auth.logout}
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setLoginModalOpen(true)}
                  className="text-sm font-medium text-text-secondary hover:text-white transition-colors px-4 py-2"
                >
                  {t.auth.login}
                </button>
              )}
            </div>

            {/* CTA */}
            <Button
              href={isAuthenticated ? "/plan" : "#planner"}
              size="sm"
            >
              {t.nav.planMyTrip}
            </Button>

          </div>


          {/* Mobile Right Actions */}
          <div className="flex md:hidden items-center gap-3">
            {/* Mobile CTA (Compact) */}
            <Link
              href={variant === "dashboard" ? "/dashboard#planner" : "#planner"}
              className="bg-accent hover:bg-accent-hover transition-colors text-white text-[10px] font-medium px-3 py-1.5 rounded-md uppercase tracking-wider"
            >
              {t.nav.planMyTrip}
            </Link>

            {/* Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-0 z-[60] bg-bg-primary transition-all duration-500 md:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full px-6 py-8">
          <div className="flex items-center justify-between mb-12">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-lg">
                ✈
              </div>
              <span className="text-white font-medium text-xs tracking-[2px] uppercase">
                Travel AI World
              </span>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>

          {/* Mobile Nav Links */}
          <nav className="flex flex-col gap-8 mb-auto">
            {variant === "landing" && (
              <>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium text-white hover:text-accent transition-colors"
                >
                  {t.nav.howItWorks}
                </a>
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium text-white hover:text-accent transition-colors"
                >
                  {t.nav.features}
                </a>
                <a
                  href="#testimonials"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium text-white hover:text-accent transition-colors"
                >
                  {t.nav.reviews}
                </a>
              </>
            )}
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-2xl font-medium transition-colors ${
                variant === "dashboard" ? "text-accent" : "text-white hover:text-accent"
              }`}
            >
              {t.nav.myDashboard}
            </Link>
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-2xl font-medium text-white hover:text-accent transition-colors"
            >
              {t.nav.home}
            </Link>
          </nav>

          {/* Mobile Auth */}
          <div className="mt-8 pt-8 border-t border-border">
            {isAuthenticated ? (
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  {user?.picture ? (
                    <img 
                      src={user.picture} 
                      alt={user.name} 
                      className="w-12 h-12 rounded-full border border-accent/30"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                      <UserIcon size={24} />
                    </div>
                  )}
                  <div>
                    <p className="text-white font-medium">{user?.name}</p>
                    <p className="text-text-secondary text-sm">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 text-xl font-medium text-white hover:text-accent transition-colors"
                >
                  <LogOut size={24} />
                  {t.auth.logout}
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setLoginModalOpen(true);
                }}
                className="text-2xl font-medium text-white hover:text-accent transition-colors"
              >
                {t.auth.login}
              </button>
            )}
          </div>


          {/* Mobile Language Switcher (Pill style) */}
          <div className="mt-auto pt-8 border-t border-border">
            <p className="text-xs text-text-secondary uppercase tracking-widest font-medium mb-4">
              Select Language
            </p>
            <div className="flex items-center gap-2 bg-white/5 border border-border-soft rounded-2xl p-1.5 w-fit relative overflow-hidden">
              {(["en", "es"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-500 cursor-pointer overflow-hidden group ${
                    language === lang
                      ? "text-white"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  {language === lang && (
                    <div className="absolute inset-0 bg-accent shadow-[0_0_20px_rgba(79,110,247,0.5)] z-0" />
                  )}
                  <span className="relative z-10 text-base">{FLAG[lang]}</span>
                  <span className="relative z-10 uppercase tracking-widest">{lang}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <LoginModal 
        isOpen={loginModalOpen} 
        onClose={() => setLoginModalOpen(false)} 
      />
    </>
  );
}

