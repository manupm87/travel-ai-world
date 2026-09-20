import { cn } from "@/utils/cn";

interface AuroraProps {
  className?: string;
}

/**
 * The dusk horizon: the living background every public page sits on.
 *
 * Three radial lights — indigo, violet, and the amber band where the sky meets
 * the ground — over the page's own background colour, with a film grain on top.
 * It is `fixed` and `-z-10`, so it never takes part in the layout (no shift, no
 * scrollbar) and never takes a click; `aria-hidden` keeps it out of the
 * accessibility tree. The drift is transform-only and stops entirely under
 * `prefers-reduced-motion` (handled once, in `globals.css`).
 *
 * The planner has its own full-height layout and does not mount it.
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
      <span className="aurora-grain absolute inset-0 opacity-[0.045] mix-blend-overlay" />
    </div>
  );
}
