import React from "react";


/**
 * Micro Typography: Section Label.
 * 
 * Standardized small, uppercase, accented text used as an eyebrow heading
 * above major section titles (e.g. "HOW IT WORKS", "TESTIMONIALS").
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-accent text-[12px] font-medium tracking-[0.1em] uppercase">
      {children}
    </p>
  );
}
