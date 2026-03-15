import React from "react";
import Header from "../layout/Header";

interface TripViewLayoutProps {
  children: React.ReactNode;
}

/**
 * Trip Viewer Page Layout.
 * 
 * Encapsulates the common shell for trip-related pages, including the
 * global header, minimum screen height, and consistent main content padding.
 */
export default function TripViewLayout({ children }: TripViewLayoutProps) {
  // layout constants for internal use
  const shellClasses = "min-h-screen bg-bg-primary flex flex-col font-sans";
  const mainClasses = "flex flex-col flex-1 pb-20 pt-[72px]";

  return (
    <div className={shellClasses}>
      <Header variant="dashboard" />
      <main className={mainClasses}>
        {children}
      </main>
    </div>
  );
}
