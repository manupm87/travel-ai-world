import { useId } from "react";
import Link from "next/link";
import { cn } from "@/utils/cn";

interface LogoProps {
  onClick?: () => void;
  className?: string;
}

/** The pin in a `0 0 100 100` box; the four-point star is a hole (evenodd). */
const PIN_ALONE =
  "M50 96 C40 78 16 64 16 40 A34 34 0 1 1 84 40 C84 64 60 78 50 96 Z M50 20 Q53 37 70 40 Q53 43 50 60 Q47 43 30 40 Q47 37 50 20 Z";

/** The world under the pin, in the `0 8 200 200` box, in paint order. */
const WORLD_VIEW_BOX = "0 8 200 200";
const OCEAN = "M-10 137.4 A200 200 0 0 1 210 137.4 L210 220 L-10 220 Z";
const CONTINENT =
  "M58 124 C66 118 80 118 90 116 C96 115 104 114 110 116 C122 119 134 118 146 122 C156 126 164 124 170 132 C176 140 168 148 160 150 C150 153 148 162 140 168 C132 175 124 172 118 180 C112 190 106 200 100 210 L78 210 C76 196 70 186 62 178 C54 170 44 168 42 158 C40 148 48 146 50 138 C52 130 52 128 58 124 Z";
const ISLANDS = [
  "M168 170 C174 166 182 168 182 174 C182 180 174 182 170 179 C166 176 164 173 168 170 Z",
  "M30 184 C34 180 42 182 42 187 C42 192 34 193 31 190 C28 188 27 186 30 184 Z",
];
/** The gap in the horizon is where the pin stands. */
const HORIZON =
  "M-10 137.4 A200 200 0 0 1 88 104.8 M112 104.8 A200 200 0 0 1 210 137.4";
const PIN_ON_WORLD =
  "M100 112 C93 98 70 84 70 58 A30 30 0 1 1 130 58 C130 84 107 98 100 112 Z M100 42 Q102 56 116 58 Q102 60 100 74 Q98 60 84 58 Q98 56 100 42 Z";

/** Radius of the tile, as a share of its side. */
const TILE_RADIUS = 23;

/**
 * The mark: the pin over the world (TRA-259). A map pin with a four-point
 * star standing on the curve of a world, on a rounded tile. Three levels of
 * detail, by size: up to 32 px the pin alone; up to 64 px the ocean, the
 * continent and the pin; above that the two islands and the horizon line too.
 * Colours come from the `--logo-*` tokens, so one drawing serves both themes.
 * Exported on its own for the surfaces that show the brand without linking
 * home — the sign-in dialog.
 */
export function Mark({ size = 28 }: { size?: number }) {
  const clipId = useId();
  // The tile is drawn in a 100-unit box: one CSS pixel of border is 100/size.
  const border = 100 / size;
  const world = size > 32;
  const full = size > 64;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="100" height="100" rx={TILE_RADIUS} />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx={TILE_RADIUS} fill="var(--logo-tile)" />
      {world ? (
        <g clipPath={`url(#${clipId})`}>
          <svg viewBox={WORLD_VIEW_BOX} width="100" height="100">
            <path data-part="ocean" d={OCEAN} fill="var(--logo-ocean)" />
            <path data-part="continent" d={CONTINENT} fill="var(--logo-land)" />
            {full &&
              ISLANDS.map((d) => (
                <path key={d} data-part="island" d={d} fill="var(--logo-land)" />
              ))}
            {full && (
              <path
                data-part="horizon"
                d={HORIZON}
                stroke="var(--logo-horizon)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            )}
            <path
              data-part="pin"
              d={PIN_ON_WORLD}
              transform="translate(0 18)"
              fill="var(--logo-pin)"
              fillRule="evenodd"
            />
          </svg>
        </g>
      ) : (
        <path
          data-part="pin"
          d={PIN_ALONE}
          transform="translate(12.5 12.5) scale(0.75)"
          fill="var(--logo-pin)"
          fillRule="evenodd"
        />
      )}
      <rect
        x={border / 2}
        y={border / 2}
        width={100 - border}
        height={100 - border}
        rx={TILE_RADIUS - border / 2}
        stroke="var(--logo-tile-border)"
        strokeWidth={border}
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
