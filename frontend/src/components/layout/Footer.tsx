"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";


/**
 * Global Footer.
 * 
 * Renders the standard site footer containing static links, copyright information,
 * and social media references. Uses translation dictionaries for content.
 */
export default function Footer() {
  const { t } = useLanguage();
  const f = t.footer;

  return (
    <footer className="bg-bg-footer pt-16 pb-10">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-12">
        {/* Top */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="flex flex-col gap-4 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 w-fit">
              <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
                ✈
              </div>
              <span className="text-text-primary font-bold text-sm tracking-[2px] uppercase">
                Travel AI World
              </span>
            </Link>
            <p className="text-text-secondary text-[13px] leading-relaxed max-w-[240px]">
              {f.tagline}
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(f.links).map(([category, links]) => (
            <div key={category} className="flex flex-col gap-4">
              <h4 className="text-[11px] font-black text-text-primary tracking-[2px] uppercase opacity-90">
                {category}
              </h4>
              <ul className="flex flex-col gap-3">
                {(links as readonly string[]).map((label) => (
                  <li key={label}>
                    <a href="#" className="text-text-secondary text-sm hover:text-text-primary transition-all duration-200">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-border-soft" />

        {/* Bottom */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-text-secondary text-xs">{f.copyright}</p>
          <div className="flex gap-6">
            {["Twitter", "Instagram", "LinkedIn"].map((s) => (
              <a key={s} href="#" className="text-text-secondary text-xs hover:text-text-primary transition-colors">
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
