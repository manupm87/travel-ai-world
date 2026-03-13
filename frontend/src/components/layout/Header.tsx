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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-bg-primary/90 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 h-[72px] flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-lg">
            ✈
          </div>
          <span className="text-white font-bold text-sm lg:text-base tracking-[2px] uppercase">
            Travel AI World
          </span>
        </Link>

        <div className="flex-1" />

        {/* Nav */}
        {variant === "landing" && (
          <nav className="hidden md:flex items-center gap-8">
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

        {/* Dashboard Link (Mock Logged In) */}
        {variant === "landing" && (
          <Link
            href="/dashboard"
            className="text-text-secondary text-sm hover:text-white font-semibold transition-colors ml-4"
          >
            My Dashboard
          </Link>
        )}

        {/* CTA */}
        <Link
          href={variant === "dashboard" ? "/dashboard#planner" : "#planner"}
          className="flex-shrink-0 bg-accent hover:bg-accent-hover transition-colors text-white text-sm font-semibold px-5 py-2.5 rounded-md"
        >
          {t.nav.planMyTrip}
        </Link>
      </div>
    </header>
  );
}
