import React from "react";
import Link from "next/link";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
  variant?: "primary" | "secondary" | "ghost" | "white";
  size?: "sm" | "md" | "lg";
  as?: React.ElementType;
  href?: string;
}

export function Button({ 
  children, 
  variant = "primary", 
  size = "md",
  as, 
  href, 
  className = "", 
  ...props 
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center transition-all duration-200 cursor-pointer rounded-lg font-semibold";
  
  const sizes = {
    sm: "px-5 py-2 text-[13px]",
    md: "px-9 py-4 text-base",
    lg: "px-12 py-5 text-lg"
  };

  const variants = {
    primary: "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/40",
    secondary: "bg-white/5 hover:bg-white/10 border border-border-soft text-white/80",
    ghost: "bg-transparent hover:bg-white/5 text-text-secondary hover:text-white",
    white: "bg-white hover:bg-white/90 text-accent font-bold shadow-xl"
  };

  const combinedClasses = `${baseStyles} ${sizes[size]} ${variants[variant]} ${className}`;

  if (href) {
    const isInternal = href.startsWith("/") || href.startsWith("#");
    const Component = as || (isInternal ? Link : "a");
    
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Component href={href} className={combinedClasses} {...(props as any)}>
        {children}
      </Component>
    );
  }

  const Component = as || "button";
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Component className={combinedClasses} {...(props as any)}>
      {children}
    </Component>
  );
}
