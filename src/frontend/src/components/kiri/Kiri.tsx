/** Kiri, the suitcase mascot, drawn from pixel frames. */

import { cn } from "@/utils/cn";
import { KIRI_FACE, KIRI_FRAMES, type KiriColour, type KiriFrame, type KiriState } from "./frames";

export type { KiriState } from "./frames";

/**
 * Each colour key of a frame and the token it paints with (`globals.css`,
 * `--kiri-*`). Kiri's clay is the one warm colour of the interface; her
 * thinking marks and her "zzz" take the theme's muted grey.
 */
const KIRI_COLOURS: Record<KiriColour, string> = {
  o: "var(--kiri-outline)",
  l: "var(--kiri-light)",
  b: "var(--kiri-clay)",
  d: "var(--kiri-dark)",
  w: "var(--kiri-white)",
  e: "var(--kiri-eye)",
  p: "var(--kiri-cheek)",
  s: "var(--kiri-cream)",
  t: "var(--kiri-tag)",
  k: "var(--kiri-eye)",
  g: "var(--kiri-handle)",
  z: "var(--kiri-mark)",
  c: "var(--kiri-tear)",
  "1": "var(--kiri-sticker-1)",
  "2": "var(--kiri-sticker-2)",
  "3": "var(--kiri-sticker-3)",
};

interface KiriProps {
  state?: KiriState;
  /**
   * Pixels per art pixel, rounded to an integer because pixel art only reads at
   * whole multiples: 1 (16 px, a favicon), 2 (32 px, the chat), 4 (64 px, a phone).
   */
  scale?: number;
  /** An accessible name; without one Kiri is decoration (`aria-hidden`). */
  label?: string;
  className?: string;
}

function Frame({
  frame,
  scale,
  label,
  className,
  dataState,
}: {
  frame: KiriFrame;
  scale: number;
  label?: string;
  className?: string;
  dataState: string;
}) {
  const px = Math.max(1, Math.round(scale));
  return (
    <svg
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      width={frame.width * px}
      height={frame.height * px}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-kiri={dataState}
      className={cn("block shrink-0", className)}
    >
      {frame.layers.map(([colour, d], i) => (
        <path key={i} d={d} fill={KIRI_COLOURS[colour]} />
      ))}
    </svg>
  );
}

/** Kiri, the suitcase mascot who packs the trip with the traveller: one pixel-art frame per `KiriState`. */
export function Kiri({ state = "idle", scale = 2, label, className }: KiriProps) {
  return (
    <Frame
      frame={KIRI_FRAMES[state]}
      scale={scale}
      label={label}
      className={className}
      dataState={state}
    />
  );
}

/** Kiri's face alone, for the outside of the closed suitcase. */
export function KiriFace({ scale = 2, className }: { scale?: number; className?: string }) {
  return <Frame frame={KIRI_FACE} scale={scale} className={className} dataState="face" />;
}
