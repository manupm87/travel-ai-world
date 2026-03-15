import React from "react";
import Header from "../layout/Header";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Dashboard Page Layout.
 * 
 * Standardizes the shell for the user dashboard.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const shellClasses = "min-h-screen bg-bg-primary flex flex-col font-sans";
  const mainClasses = "flex flex-col flex-1 pt-[72px]";

  return (
    <div className={shellClasses}>
      <Header variant="dashboard" />
      <main className={mainClasses}>
        {children}
      </main>
    </div>
  );
}
