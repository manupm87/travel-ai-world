import React from "react";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}


/**
 * Primary Page Container.
 * 
 * Enforces the maximum application width (1440px) and standard horizontal padding
 * (responsive px-8 to px-16). Ensure main content blocks are wrapped in this
 * component to maintain grid alignment across different screen sizes.
 */
export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className={`max-w-[1440px] w-full mx-auto px-8 lg:px-16 ${className}`}>
      {children}
    </div>
  );
}
