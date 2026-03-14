import React from "react";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-accent text-[12px] font-bold tracking-[0.1em] uppercase">
      {children}
    </p>
  );
}
