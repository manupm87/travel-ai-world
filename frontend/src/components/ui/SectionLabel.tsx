import React from "react";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-accent text-[11px] font-bold tracking-[3px] uppercase">
      {children}
    </p>
  );
}
