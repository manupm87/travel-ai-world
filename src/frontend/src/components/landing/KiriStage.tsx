"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Kiri, type KiriState } from "@/components/kiri/Kiri";
import { cn } from "@/utils/cn";

/**
 * Where Kiri is in her entrance. She arrives rolling with the handle out,
 * brakes, folds the handle down (it clicks), and waits; on the way out she
 * pulls the handle up, tilts and rolls off to the planner.
 */
type Phase = "out" | "arriving" | "braking" | "settling" | "waiting" | "tilting" | "leaving";

/** Pixels per art pixel: 96 px wide on a desktop, 64 on a phone. */
const SCALE = 6;
const SCALE_SMALL = 4;

/** The timeline of the entrance, in ms from the start (the canvas's own). */
const ARRIVE_AT = 80;
const BRAKE_AT = 2900;
const SETTLE_AT = 3560;
const WAIT_AT = 4050;
/** On the way out: the tilt, then the roll. */
const ROLL_OFF_AT = 480;
/** How often she blinks while she waits. */
const BLINK_EVERY_MS = 2800;
const BLINK_MS = 170;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export interface KiriStageProps {
  /** The field has the focus: she looks up at it. */
  listening: boolean;
  /** Something is typed: she thinks about it. */
  noting: boolean;
  /** The ask was sent: she sets off for the planner. */
  leaving: boolean;
}

/**
 * The landing's one orchestrated moment (TRA-236): Kiri rolls in along a
 * dotted floor under the field, brakes, clicks her handle down and waits,
 * blinking. She looks up when the field takes the focus, thinks while the
 * traveller types, and rolls off when the ask is sent.
 *
 * Decoration from end to end — Kiri and what she says are `aria-hidden`, and
 * nothing here takes the keyboard. Under reduced
 * motion she is simply standing there.
 */
export function KiriStage({ listening, noting, leaving }: KiriStageProps) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>("out");
  const [blink, setBlink] = useState(false);

  // The entrance, once per visit.
  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = window.setTimeout(() => setPhase("waiting"), 0);
      return () => window.clearTimeout(id);
    }
    const steps: Array<[number, Phase]> = [
      [0, "out"],
      [ARRIVE_AT, "arriving"],
      [BRAKE_AT, "braking"],
      [SETTLE_AT, "settling"],
      [WAIT_AT, "waiting"],
    ];
    const timers = steps.map(([at, next]) => window.setTimeout(() => setPhase(next), at));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // The exit.
  useEffect(() => {
    if (!leaving) return;
    const tilt = window.setTimeout(() => setPhase("tilting"), 0);
    const off = window.setTimeout(() => setPhase("leaving"), ROLL_OFF_AT);
    return () => {
      window.clearTimeout(tilt);
      window.clearTimeout(off);
    };
  }, [leaving]);

  // A blink every few seconds while she waits.
  useEffect(() => {
    if (phase !== "waiting") return;
    let reopen: number | undefined;
    const id = window.setInterval(() => {
      setBlink(true);
      reopen = window.setTimeout(() => setBlink(false), BLINK_MS);
    }, BLINK_EVERY_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(reopen);
    };
  }, [phase]);

  const waiting = phase === "waiting";
  const rolling = phase === "arriving" || phase === "leaving";

  let state: KiriState = blink ? "blink" : "idle";
  if (phase === "arriving") state = "dragging";
  else if (phase === "braking" || phase === "tilting" || phase === "leaving") state = "handle";
  else if (waiting && noting) state = "thinking";
  else if (waiting && listening) state = "look";

  let bubble: string | null = null;
  if (waiting) bubble = noting ? t.landing.kiri.noting : listening ? t.landing.kiri.listening : t.landing.kiri.ready;
  else if (phase === "tilting") bubble = t.landing.kiri.off;

  const move = cn(
    rolling && "animate-kiri-roll",
    phase === "braking" && "animate-kiri-brake",
    phase === "settling" && "animate-kiri-settle",
    phase === "tilting" && "animate-kiri-tilt"
  );

  return (
    <div className="relative h-[150px] w-full shrink-0 sm:h-[190px]" data-kiri-phase={phase}>
      {/* The floor she rolls along. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 border-t-2 border-dotted border-glass-border"
      />

      <div
        aria-hidden="true"
        className={cn(
          "absolute bottom-0 h-[104px] w-16 sm:h-[156px] sm:w-24",
          phase === "out" && "-left-[220px]",
          phase !== "out" && phase !== "leaving" && "left-[calc(50%-32px)] sm:left-[calc(50%-48px)]",
          phase === "leaving" && "left-[calc(100%+220px)]",
          phase === "arriving" && "transition-[left] duration-[2800ms] ease-[cubic-bezier(.22,.7,.3,1)]",
          phase === "leaving" && "transition-[left] duration-[1500ms] ease-[cubic-bezier(.55,0,.8,.3)]"
        )}
      >
        {/* Her shadow on the floor. */}
        <span className="absolute bottom-[-6px] left-1/2 h-3 w-[84%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.45),transparent)]" />

        {rolling && (
          <>
            <span className="absolute bottom-[34px] left-[-34px] h-[3px] w-[26px] animate-kiri-streak rounded-sm bg-text-muted" />
            <span className="absolute bottom-[70px] left-[-48px] h-[3px] w-[18px] animate-kiri-streak rounded-sm bg-text-muted [animation-delay:.18s]" />
            <Puff className="left-[-6px] bottom-[-2px]" />
            <Puff className="left-[-6px] bottom-[-2px] [animation-delay:.23s]" />
          </>
        )}

        <div className={cn("absolute bottom-0 left-0 flex origin-bottom items-end", move)}>
          <span className="sm:hidden">
            <Kiri state={state} scale={SCALE_SMALL} />
          </span>
          <span className="hidden sm:block">
            <Kiri state={state} scale={SCALE} />
          </span>
        </div>

        {phase === "settling" && <Click className="left-[40%] top-[20%]" />}

        {bubble && (
          <p
            key={bubble}
            className={cn(
              "absolute animate-fade-up whitespace-nowrap rounded-[14px] border border-glass-border bg-glass-bg px-3.5 py-2.5 font-pixel text-[15px] leading-tight text-text-primary backdrop-blur-xl",
              "bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 rounded-bl-[14px]",
              "sm:bottom-auto sm:top-3.5 sm:left-[140px] sm:translate-x-0 sm:rounded-bl-[4px]"
            )}
          >
            {bubble}
          </p>
        )}
      </div>

    </div>
  );
}

/** A puff of dust behind the wheels. */
function Puff({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 6 4"
      width={18}
      height={12}
      shapeRendering="crispEdges"
      className={cn("absolute animate-kiri-puff", className)}
    >
      <path d="M1 0h2v1h-2zM0 1h4v1h-4zM5 1h1v1h-1zM0 2h6v1h-6zM1 3h4v1h-4z" fill="var(--kiri-handle)" />
    </svg>
  );
}

/** The click of the handle folding down. */
function Click({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 5 5"
      width={25}
      height={25}
      shapeRendering="crispEdges"
      className={cn("absolute animate-kiri-pop", className)}
    >
      <path d="M2 0h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM2 4h1v1h-1z" fill="var(--kiri-mark)" />
    </svg>
  );
}
