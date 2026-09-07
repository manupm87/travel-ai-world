import React from "react";
import Link from "next/link";
import { cn } from "@/utils/cn";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
  variant?: "primary" | "secondary" | "ghost" | "white";
  size?: "sm" | "md" | "lg";
  as?: React.ElementType;
  href?: string;
}

type PolymorphicProps = React.ButtonHTMLAttributes<
  HTMLButtonElement | HTMLAnchorElement
> & { href?: string };

const BASE =
  "inline-flex items-center justify-center transition-all duration-200 cursor-pointer rounded-lg font-medium";

const SIZES = {
  sm: "px-5 py-2 text-[13px]",
  md: "px-9 py-4 text-base",
  lg: "px-12 py-5 text-lg",
} as const;

const VARIANTS = {
  primary: "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/40",
  secondary: "bg-bg-secondary hover:opacity-80 border border-border-soft text-text-primary",
  ghost: "bg-transparent hover:bg-bg-secondary text-text-secondary hover:text-text-primary",
  white: "bg-white hover:bg-white/90 text-accent font-medium shadow-xl",
} as const;

/**
 * Shared Button / Anchor Primitive.
 *
 * Polymorphic: with an `href` it renders a `Link` (internal) or `<a>`;
 * otherwise a `<button>`. `className` is merged with `cn`, so a consumer's
 * padding or radius overrides the size preset instead of competing with it.
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
  className,
  ...props
}: ButtonProps) {
  const classes = cn(BASE, SIZES[size], VARIANTS[variant], className);

  if (href) {
    const isInternal = href.startsWith("/") || href.startsWith("#");
    const Component = (as ||
      (isInternal ? Link : "a")) as React.ElementType<PolymorphicProps>;

    return (
      <Component href={href} className={classes} {...props}>
        {children}
      </Component>
    );
  }

  const Component = (as || "button") as React.ElementType<PolymorphicProps>;
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
