import React from "react";
import Link from "next/link";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
  variant?: "primary" | "secondary" | "ghost" | "white";
  size?: "sm" | "md" | "lg";
  as?: React.ElementType;
  href?: string;
}


/**
 * Shared Button / Anchor Primitive.
 * 
 * A highly reusable UI component that standardizes button styling across the app.
 * It automatically polymorphic: if an `href` prop is provided, it renders as an 
 * `<a>` or `<Link>` element. Otherwise, it renders as a standard `<button>`.
 * 
 * @param variant - Stylistic variation (`primary`, `secondary`, `ghost`, `white`).
 * @param size - Size variation (`sm`, `md`, `lg`).
 * @param as - Override the underlying HTML element/component.
 * @param href - If provided, transforms the button into an interactive link.
 */
export function Button({ 
  children, 
  variant = "primary", 
  size = "md",
  as, 
  href, 
  className = "", 
  ...props 
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center transition-all duration-200 cursor-pointer rounded-lg font-medium";
  
  const sizes = {
    sm: "px-5 py-2 text-[13px]",
    md: "px-9 py-4 text-base",
    lg: "px-12 py-5 text-lg"
  };

  const variants = {
    primary: "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/40",
    secondary: "bg-bg-secondary hover:opacity-80 border border-border-soft text-text-primary",
    ghost: "bg-transparent hover:bg-bg-secondary text-text-secondary hover:text-text-primary",
    white: "bg-white hover:bg-white/90 text-accent font-medium shadow-xl"
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
