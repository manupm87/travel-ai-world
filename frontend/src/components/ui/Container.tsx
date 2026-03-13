import React from "react";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className={`max-w-[1440px] w-full mx-auto px-8 lg:px-16 ${className}`}>
      {children}
    </div>
  );
}
