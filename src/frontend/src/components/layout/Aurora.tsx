/** The drifting aurora background. */

import { cn } from "@/utils/cn";

interface AuroraProps {
  className?: string;
}

/**
 * The drifting background behind the public and reading pages: three radial lights and a dot grid.
 * `fixed` and `-z-10`, so it never shifts the layout or takes a click.
 */
export function Aurora({ className }: AuroraProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden",
        className
      )}
    >
      <span className="absolute -top-[28vmax] -left-[18vmax] h-[72vmax] w-[72vmax] will-change-transform animate-aurora-drift bg-[radial-gradient(circle_at_center,var(--aurora-1),transparent_62%)]" />
      <span className="absolute -top-[10vmax] -right-[24vmax] h-[62vmax] w-[62vmax] will-change-transform animate-aurora-drift-slow bg-[radial-gradient(circle_at_center,var(--aurora-2),transparent_60%)]" />
      <span className="absolute inset-x-0 bottom-0 h-[42vh] bg-[radial-gradient(ellipse_130%_100%_at_50%_100%,var(--aurora-3),transparent_72%)]" />
      <span className="aurora-dots absolute inset-0" />
    </div>
  );
}
