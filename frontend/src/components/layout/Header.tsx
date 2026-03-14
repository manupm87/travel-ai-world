"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/i18n";

const FLAG: Record<Language, string> = { en: "🇬🇧", es: "🇪🇸" };

interface HeaderProps {
  variant?: "landing" | "dashboard";
}

export default function Header({ variant = "landing" }: HeaderProps) {
  const { t, language, setLanguage } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <span className="text-white font-bold text-xs md:text-sm lg:text-base tracking-[2px] uppercase whitespace-nowrap">
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
            {/* Language switcher */}
            <div className="flex items-center gap-1 bg-white/5 border border-border-soft rounded-lg p-1">
              {(["en", "es"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
                    language === lang
                      ? "bg-accent text-white shadow-sm"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  <span>{FLAG[lang]}</span>
                  <span className="uppercase">{lang}</span>
                </button>
              ))}
            </div>

            {/* Dashboard / Home Link */}
            <Link
              href={variant === "landing" ? "/dashboard" : "/"}
              className="text-text-secondary text-sm hover:text-white font-semibold transition-colors nav-link"
            >
              {variant === "landing" ? t.nav.myDashboard : t.nav.home}
            </Link>

            {/* CTA */}
            <Link
              href={variant === "dashboard" ? "/dashboard#planner" : "#planner"}
              className="flex-shrink-0 bg-accent hover:bg-accent-hover transition-colors text-white text-sm font-semibold px-5 py-2.5 rounded-md"
            >
              {t.nav.planMyTrip}
            </Link>
          </div>

          {/* Mobile Right Actions */}
          <div className="flex md:hidden items-center gap-3">
            {/* Mobile CTA (Compact) */}
            <Link
              href={variant === "dashboard" ? "/dashboard#planner" : "#planner"}
              className="bg-accent hover:bg-accent-hover transition-colors text-white text-[10px] font-bold px-3 py-1.5 rounded-md uppercase tracking-wider"
            >
              {t.nav.planMyTrip}
            </Link>

            {/* Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
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
              <span className="text-white font-bold text-xs tracking-[2px] uppercase">
                Travel AI World
              </span>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Mobile Nav Links */}
          <nav className="flex flex-col gap-8 mb-auto">
            {variant === "landing" && (
              <>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-bold text-white hover:text-accent transition-colors"
                >
                  {t.nav.howItWorks}
                </a>
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-bold text-white hover:text-accent transition-colors"
                >
                  {t.nav.features}
                </a>
                <a
                  href="#testimonials"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-bold text-white hover:text-accent transition-colors"
                >
                  {t.nav.reviews}
                </a>
              </>
            )}
            <Link
              href={variant === "landing" ? "/dashboard" : "/"}
              onClick={() => setMobileMenuOpen(false)}
              className="text-2xl font-bold text-white hover:text-accent transition-colors"
            >
              {variant === "landing" ? t.nav.myDashboard : t.nav.home}
            </Link>
          </nav>

          {/* Mobile Language Switcher (Pill style) */}
          <div className="mt-auto pt-8 border-t border-border">
            <p className="text-xs text-text-secondary uppercase tracking-widest font-semibold mb-4">
              Select Language
            </p>
            <div className="flex items-center gap-2 bg-white/5 border border-border-soft rounded-xl p-1.5 w-fit">
              {(["en", "es"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer ${
                    language === lang
                      ? "bg-accent text-white shadow-lg"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  <span className="text-base">{FLAG[lang]}</span>
                  <span className="uppercase">{lang}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
