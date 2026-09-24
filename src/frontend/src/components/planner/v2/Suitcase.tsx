"use client";

import { useEffect, useState } from "react";
import { Check, MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { useBriefValues } from "@/hooks/useBriefValues";
import { PACKING_STEPS, type ItineraryDraft, type PackingState } from "@/hooks/plannerReducer";
import { KiriFace } from "@/components/kiri/Kiri";
import { DAY_PARTS, type TripBrief } from "@/types/planner";
import { cn } from "@/utils/cn";

/** Compartments in the base: the canvas draws four, two by two. */
const COMPARTMENTS = 4;
/** Tiles a compartment has room for: two a day in the grid, more in one wide one. */
const TILES = 2;
const TILES_WIDE = 5;
/** How long the lid waits before it swings open, as on the canvas. */
const OPEN_AFTER_MS = 300;

export interface SuitcaseProps {
  packing: PackingState;
  brief: TripBrief;
  itinerary: ItineraryDraft;
  /** The newest question's options, when the turn is choosing rather than drafting. */
  optionTitles: string[];
  /** The lid is shut: the suitcase is packed (or has not opened yet). */
  closed: boolean;
}

function reached(packing: PackingState, step: PackingState["step"]): boolean {
  return PACKING_STEPS.indexOf(packing.step) >= PACKING_STEPS.indexOf(step);
}

/**
 * The suitcase Kiri packs while a turn streams (TRA-242), after the canvas's
 * "Hacer la maleta", upright for the chat column. The lid holds two pockets —
 * "The list", the brief as it is written down, and "From the wardrobe", the
 * sources drawn on — and the base the days, each compartment filling with its
 * stops as the itinerary patches arrive (or, on a turn that is choosing, the
 * options being considered). When the turn ends the lid turns over and shuts,
 * showing Kiri's face, the destination's tag and, if something weighed too
 * much, a sticker. Decoration: what it shows is on the page in words too.
 */
export function Suitcase({ packing, brief, itinerary, optionTitles, closed }: SuitcaseProps) {
  const { t } = useLanguage();
  const s = t.plan.packing.suitcase;
  const values = useBriefValues(brief);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setOpened(true), OPEN_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  const listed = reached(packing, "list")
    ? [values.destination, values.dates, values.travellers, values.interests].filter(
        (value): value is string => value !== null
      )
    : [];
  const sources = reached(packing, "wardrobe") ? packing.sources : [];
  const packed = reached(packing, "fold");

  const days = itinerary.days.slice(0, COMPARTMENTS).map((day) => ({
    key: `day-${day.day}`,
    label: interpolate(s.day, { day: day.day }),
    titles: DAY_PARTS.flatMap((part) => day.slots[part].map((card) => card.title)),
  }));
  const compartments =
    days.length > 0
      ? days
      : optionTitles.length > 0
        ? [{ key: "options", label: s.options, titles: optionTitles }]
        : [];
  const wide = compartments.length === 1;

  let delay = 0;

  return (
    <div
      aria-hidden="true"
      data-suitcase={closed || !opened ? "closed" : "open"}
      className="suitcase relative flex flex-col"
    >
      {/* The lid: its inside while open, its outside once it turns over. */}
      <div
        className="suitcase-lid relative z-10 h-[150px]"
        style={{ transform: closed || !opened ? "rotateX(180deg)" : "rotateX(0deg)" }}
      >
        <div className="suitcase-face">
          <span className="suitcase-shell" />
          <div className="suitcase-lining grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-[10px] border-[1.5px] border-dashed border-glass-border px-2.5 py-2">
              <span className="text-[11px] text-text-muted">{s.list}</span>
              {listed.map((value, index) => (
                <span
                  key={value}
                  className="flex animate-fade-up items-center gap-1.5 truncate text-[12px] text-text-primary"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <Check size={12} className="shrink-0 text-accent" />
                  <span className="truncate">{value}</span>
                </span>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-1 overflow-hidden rounded-[10px] border-[1.5px] border-dashed border-glass-border px-2.5 py-2">
              <span className="text-[11px] text-text-muted">{s.wardrobe}</span>
              <span className="flex flex-wrap gap-1">
                {sources.map((source, index) => (
                  <span
                    key={source}
                    className="inline-flex h-5 animate-fade-up items-center rounded-md bg-bg-surface px-1.5 text-[10.5px] text-text-secondary"
                    style={{ animationDelay: `${index * 120}ms` }}
                  >
                    {source}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className="suitcase-face suitcase-outer">
          <div className="suitcase-ext flex items-center justify-center">
            <KiriFace scale={6} />
            {brief.destination && (
              <span className="absolute top-3 right-4 flex rotate-6 items-center gap-1.5 rounded-md bg-[#EFEDE7] px-2.5 py-1 text-[12px] font-semibold text-sticker-ink shadow-[0_6px_12px_-6px_rgba(0,0,0,0.6)]">
                <span className="h-2 w-2 rounded-full border-2 border-[#6E8F83]" />
                {brief.destination}
              </span>
            )}
            {packing.warned && (
              <span className="absolute bottom-3 left-4 -rotate-6 rounded-lg bg-sticker-overweight px-2.5 py-1 text-[11px] font-bold text-sticker-ink shadow-[0_0_0_2px_#EFEDE7]">
                {t.plan.packing.stickers.overloaded_day}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The base: one compartment per day. */}
      <div className="relative h-[176px]">
        <span className="suitcase-shell" />
        <div
          className={cn(
            "suitcase-lining grid gap-2",
            wide ? "grid-cols-1" : "grid-cols-2 grid-rows-2"
          )}
        >
          {(compartments.length > 0 ? compartments : [null, null, null, null]).map(
            (compartment, index) => (
              <div
                key={compartment?.key ?? `empty-${index}`}
                className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden rounded-lg bg-accent-soft p-1.5"
              >
                {compartment && (
                  <>
                    <span className="flex items-center justify-between text-[11px] text-text-muted">
                      <span className="truncate">{compartment.label}</span>
                      {packed && compartment.titles.length > 0 && (
                        <span>{compartment.titles.length}</span>
                      )}
                    </span>
                    {packed &&
                      compartment.titles.slice(0, wide ? TILES_WIDE : TILES).map((title) => {
                        const at = delay;
                        delay += 100;
                        return (
                          <span
                            key={title}
                            className="flex h-6 shrink-0 animate-kiri-drop items-center gap-1.5 overflow-hidden rounded-md border border-glass-border bg-bg-surface px-1.5 text-[11.5px] text-text-primary"
                            style={{ animationDelay: `${at}ms` }}
                          >
                            <MapPin size={11} className="shrink-0 text-accent" />
                            <span className="truncate">{title}</span>
                          </span>
                        );
                      })}
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
