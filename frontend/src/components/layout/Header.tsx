"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Header() {
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
          ? "bg-[#0A0A12]/90 backdrop-blur-md border-b border-white/5"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-16 h-[72px] flex items-center gap-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#4F6EF7] flex items-center justify-center text-lg">
            ✈
          </div>
          <span className="text-white font-bold text-lg tracking-[3px] uppercase">
            Travel AI World
          </span>
        </Link>

        {/* Nav */}
        <div className="flex-1" />
        <nav className="hidden md:flex items-center gap-10">
          <a
            href="#how-it-works"
            className="text-[#8888AA] text-sm hover:text-white transition-colors"
          >
            How It Works
          </a>
          <a
            href="#features"
            className="text-[#8888AA] text-sm hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="#testimonials"
            className="text-[#8888AA] text-sm hover:text-white transition-colors"
          >
            Reviews
          </a>
        </nav>

        {/* CTA */}
        <Link
          href="#planner"
          className="ml-8 flex-shrink-0 bg-[#4F6EF7] hover:bg-[#3B5BDB] transition-colors text-white text-sm font-semibold px-6 py-2.5 rounded-md"
        >
          Plan My Trip
        </Link>
      </div>
    </header>
  );
}
