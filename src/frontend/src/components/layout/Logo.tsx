import Link from "next/link";
import { cn } from "@/utils/cn";

interface LogoProps {
  onClick?: () => void;
  className?: string;
}

/**
 * The mark: a world seen from far enough away to be a dot, with an orbit
 * tilted around it. The planet takes the text colour, the orbit the accent,
 * so the pair works on either theme without a second asset.
 */
function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <circle cx="16" cy="16" r="5.5" fill="currentColor" />
      <ellipse
        cx="16"
        cy="16"
        rx="14.5"
        ry="6"
        stroke="var(--color-accent)"
        strokeWidth="1.25"
        transform="rotate(-24 16 16)"
      />
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
