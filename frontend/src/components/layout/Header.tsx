"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { LoginModal } from "@/components/auth/LoginModal";
import { Button } from "@/components/ui/Button";
import { Menu, X, LogOut, User as UserIcon, ChevronDown, LogIn, Sun, Moon } from "lucide-react";
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
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".dropdown-container")) {
        setUserDropdownOpen(false);
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
            <span className="text-text-primary font-medium text-xs md:text-sm lg:text-base tracking-[2px] uppercase whitespace-nowrap">
              Travel AI World
            </span>
          </Link>

          {/* Desktop Nav */}
          {variant === "landing" && (
            <nav className="hidden lg:flex items-center gap-8">
              <a href="#how-it-works" className="text-text-secondary text-sm hover:text-text-primary transition-colors">
                {t.nav.howItWorks}
              </a>
              <a href="#features" className="text-text-secondary text-sm hover:text-text-primary transition-colors">
                {t.nav.features}
              </a>
              <a href="#testimonials" className="text-text-secondary text-sm hover:text-text-primary transition-colors">
                {t.nav.reviews}
              </a>
            </nav>
          )}

          <div className="flex-1 hidden lg:block" />

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4 lg:gap-6">
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-9 h-9 rounded-xl border border-border-soft bg-bg-secondary hover:bg-bg-surface transition-all text-text-primary cursor-pointer"
                title={t.theme.toggle}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>

            {/* Language dropdown */}
            <div className="relative dropdown-container">
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-soft bg-bg-secondary hover:bg-bg-surface transition-all text-[11px] font-medium text-text-primary cursor-pointer"
              >
                <span>{FLAG[language]}</span>
                <span className="uppercase tracking-wider">{language}</span>
                <ChevronDown size={12} className={`transition-transform duration-300 ${langDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {langDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-32 bg-bg-primary/95 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                  {(["en", "es"] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        setLanguage(lang);
                        setLangDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-[11px] font-medium transition-colors hover:bg-bg-secondary cursor-pointer ${
                        language === lang ? "text-accent bg-accent/5" : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <span>{FLAG[lang]}</span>
                      <span className="uppercase tracking-widest">{lang === 'en' ? 'English' : 'Español'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <Button
              href={isAuthenticated ? "/dashboard" : "#planner"}
              size="sm"
            >
              {isAuthenticated ? t.nav.dashboard : t.nav.planMyTrip}
            </Button>

            {/* User Auth / Profile Dropdown */}
            <div className="relative dropdown-container">
              {isAuthenticated ? (
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  {user?.picture ? (
                    <img 
                      src={user.picture} 
                      alt={user.name} 
                      className="w-9 h-9 rounded-full object-cover border border-accent/30 shadow-[0_0_15px_rgba(79,110,247,0.2)]"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent border border-accent/30">
                      <UserIcon size={18} />
                    </div>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setLoginModalOpen(true)}
                  className="w-9 h-9 rounded-full bg-bg-secondary border border-border-soft flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-accent/30 transition-all hover:bg-bg-surface cursor-pointer"
                  title={t.auth.login}
                >
                  <LogIn size={18} />
                </button>
              )}

              {isAuthenticated && userDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-bg-primary/95 backdrop-blur-md border border-border rounded-xl shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="px-4 py-2 border-b border-border mb-1">
                    <p className="text-[12px] font-semibold text-text-primary truncate">{user?.name}</p>
                    <p className="text-[10px] text-text-secondary truncate">{user?.email}</p>
                  </div>
                  <button 
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-medium text-text-secondary hover:text-error hover:bg-error/5 transition-colors cursor-pointer"
                  >
                    <LogOut size={14} />
                    {t.auth.logout}
                  </button>
                </div>
              )}
            </div>
          </div>


          {/* Mobile Right Actions */}
          <div className="flex md:hidden items-center gap-3">
            {/* Mobile CTA (Compact) */}
            <Link
              href={isAuthenticated ? "/dashboard" : "#planner"}
              className="bg-accent hover:bg-accent-hover transition-colors text-white text-[10px] font-medium px-3 py-1.5 rounded-md uppercase tracking-wider"
            >
              {isAuthenticated ? t.nav.dashboard : t.nav.planMyTrip}
            </Link>

            {/* Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-text-primary hover:bg-bg-surface rounded-lg transition-colors flex items-center justify-center"
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
            <Link 
              href="/" 
              className="flex items-center gap-2.5"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-lg">
                ✈
              </div>
              <span className="text-text-primary font-medium text-xs tracking-[2px] uppercase">
                Travel AI World
              </span>
            </Link>

            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-text-primary hover:bg-bg-surface rounded-lg transition-colors flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>

          {/* Mobile Nav Links */}
            {/* Mobile Nav Links are now just marketing links */}
          <nav className="flex flex-col gap-8 mb-auto">
            {variant === "landing" && (
              <>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium text-text-primary hover:text-accent transition-colors"
                >
                  {t.nav.howItWorks}
                </a>
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium text-text-primary hover:text-accent transition-colors"
                >
                  {t.nav.features}
                </a>
                <a
                  href="#testimonials"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium text-text-primary hover:text-accent transition-colors"
                >
                  {t.nav.reviews}
                </a>
              </>
            )}
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
                    <p className="text-text-primary font-medium">{user?.name}</p>
                    <p className="text-text-secondary text-sm">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 text-xl font-medium text-text-primary hover:text-accent transition-colors cursor-pointer"
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
                className="text-2xl font-medium text-text-primary hover:text-accent transition-colors cursor-pointer"
              >
                {t.auth.login}
              </button>
            )}
          </div>


          <div className="mt-auto pt-8 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-text-secondary uppercase tracking-widest font-medium">
                Select Language
              </p>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-soft bg-bg-secondary text-xs text-text-primary"
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                {theme === "dark" ? t.theme.light : t.theme.dark}
              </button>
            </div>
            <div className="flex items-center gap-2 bg-bg-secondary border border-border-soft rounded-2xl p-1.5 w-fit relative overflow-hidden">
              {(["en", "es"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-500 cursor-pointer overflow-hidden group ${
                    language === lang
                      ? "text-white"
                      : "text-text-secondary hover:text-text-primary"
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

