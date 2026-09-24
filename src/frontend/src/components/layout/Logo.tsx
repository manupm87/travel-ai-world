import Link from "next/link";
import { cn } from "@/utils/cn";

interface LogoProps {
  onClick?: () => void;
  className?: string;
}

/**
 * The mark: the K of the route (TRA-235). A solid stem and leg in the text
 * colour, and the arm drawn as a dotted route that reaches its destination —
 * a sage dot. Two colours from the theme, so it works on either without a
 * second asset. Exported on its own for the surfaces that show the brand
 * without linking home — the sign-in dialog.
 */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0 overflow-visible"
    >
      <path d="M9 5.5v21" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M11.5 16.2C15 14.6 18.4 11.8 21.2 8.4"
        stroke="var(--color-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.01 4.3"
      />
      <circle cx="24.3" cy="5.6" r="3.2" fill="var(--color-accent)" />
      <path d="M14.2 14.6 24 26.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Brand mark + wordmark linking home. The brand name is not translated. */
export function Logo({ onClick, className }: LogoProps) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 flex-shrink-0 text-text-primary rounded-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-4 focus-visible:ring-offset-bg-primary",
        className
      )}
    >
      <Mark />
      <span className="font-heading text-[15px] md:text-base font-medium tracking-[-0.01em] whitespace-nowrap">
        Kyrian World
      </span>
    </Link>
  );
}
