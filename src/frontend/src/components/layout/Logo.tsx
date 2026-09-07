import Link from "next/link";
import { cn } from "@/utils/cn";

interface LogoProps {
  onClick?: () => void;
  className?: string;
}

/** Brand mark + wordmark linking home. The brand name is not translated. */
export function Logo({ onClick, className }: LogoProps) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={cn("flex items-center gap-2.5 flex-shrink-0", className)}
    >
      <span
        aria-hidden="true"
        className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-accent flex items-center justify-center text-lg"
      >
        ✈
      </span>
      <span className="text-text-primary font-medium text-xs md:text-sm lg:text-base tracking-[2px] uppercase whitespace-nowrap">
        Travel AI World
      </span>
    </Link>
  );
}
