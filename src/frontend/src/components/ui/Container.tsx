/** The page container primitive. */

import React from "react";
import { cn } from "@/utils/cn";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

/** The page's maximum width and horizontal padding, so content blocks share one grid. */
export function Container({ children, className }: ContainerProps) {
  return (
    <div className={cn("max-w-[1440px] w-full mx-auto px-8 lg:px-16", className)}>
      {children}
    </div>
  );
}
