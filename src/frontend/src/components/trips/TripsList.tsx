"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n/interpolate";
import { Kiri } from "@/components/kiri/Kiri";
import { stickerCities } from "@/utils/suitcase";
import { useTrips } from "@/hooks/useTrips";
import TripCard from "@/components/ui/TripCard";
import { TRIP_PHASES } from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";
import { cn } from "@/utils/cn";
import { ConfirmDelete } from "./ConfirmDelete";
import { RenameTripDialog } from "./RenameTripDialog";

/** How long the card takes to fold away before it leaves the list. */
const COLLAPSE_MS = 300;

/** The whole list settles in once, 40 ms apart, top to bottom. */
const STAGGER_MS = 40;

/** Enough to fill the section while the trips are on their way. */
const PLACEHOLDERS = [0, 1, 2];

/** The sticker colours, one after another, so neighbouring chips differ. */
const STICKER_DOTS = [
  "var(--color-sticker-book)",
  "var(--color-sticker-fragile)",
  "var(--color-sticker-overweight)",
];

/**
 * "Your suitcase carries 3 stickers" (TRA-237): Kiri wearing a sticker for
 * every city the account has a trip in, and those cities as chips.
 */
function SuitcaseCard({ trips }: { trips: TripSummary[] }) {
  const { t } = useLanguage();
  const cities = stickerCities(trips);
  const title =
    cities.length === 1
      ? t.dashboard.suitcaseOne
      : interpolate(t.dashboard.suitcase, { count: cities.length });

  return (
    <div className="col-span-full flex items-center gap-4 rounded-2xl border border-glass-border bg-glass-bg px-4 py-3.5 backdrop-blur-xl">
      <Kiri state="stickers" scale={3} />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        <ul className="flex flex-wrap gap-1.5">
          {cities.map((city, index) => (
            <li
              key={city}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-glass-border px-2.5 text-[13px] text-text-secondary"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: STICKER_DOTS[index % STICKER_DOTS.length] }}
              />
              {city}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The account's trips, on the signed-in home.
 *
 * One list, grouped by what is happening now, what is coming and what has
 * already happened — the order they matter in, not the order they were
 * written. A group is a line across the list rather than a section of its
 * own: a quiet heading with a rule running off it, and that group's cards
 * underneath, so four trips do not read like a landing page. The stagger
 * counts across the whole list, so it settles in one movement.
 *
 * It renders on one surface only — `/dashboard/` (ADR 0020, TRA-201): the
 * planner holds the one trip it was opened with and lists none, so the list
 * takes no props. The hook owns the data and both writes (`useTrips`); this
 * component owns which dialog is open and which card is folding away.
 * Renaming is offered only where core_api would accept it — an upcoming trip
 * — while deleting is offered on every card, because a trip can be thrown
 * away in any phase.
 */
export function TripsList() {
  const { t } = useLanguage();
  const { trips, status, reload, remove, rename } = useTrips();
  const l = t.plan.trips;

  const [renaming, setRenaming] = useState<TripSummary | null>(null);
  const [deleting, setDeleting] = useState<TripSummary | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const collapse = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (collapse.current !== null) window.clearTimeout(collapse.current);
    },
    []
  );

  /**
   * The card folds away first, then the trip leaves the list. A refusal puts
   * the card back and rethrows, so the dialog — still open — says what
   * happened instead of the trip quietly reappearing.
   */
  const confirmDelete = async (id: string) => {
    setLeavingId(id);
    await new Promise<void>((resolve) => {
      collapse.current = window.setTimeout(resolve, COLLAPSE_MS);
    });
    try {
      await remove(id);
    } catch (err) {
      setLeavingId(null);
      throw err;
    }
    setLeavingId(null);
    setDeleting(null);
  };

  if (status === "loading") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
        <p role="status" className="sr-only">
          {l.loading}
        </p>
        {PLACEHOLDERS.map((index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-[160px] animate-shimmer rounded-2xl border border-glass-border bg-gradient-to-r from-bg-card via-bg-secondary to-bg-card bg-[length:200%_100%]"
          />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 rounded-2xl border border-glass-border bg-glass-bg px-5 py-6 backdrop-blur-xl"
      >
        <h3 className="text-base font-medium text-text-primary">{l.errorTitle}</h3>
        <p className="text-sm leading-relaxed text-text-secondary">{l.errorDescription}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-2 rounded-lg border border-glass-border bg-glass-bg px-3.5 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
        >
          {l.retry}
        </button>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-glass-border px-5 py-10 text-center">
        <h3 className="text-base font-medium text-text-primary">{l.emptyTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{l.emptyDescription}</p>
      </div>
    );
  }

  const groups = TRIP_PHASES.map((phase) => ({
    phase,
    trips: trips.filter((trip) => trip.phase === phase),
  })).filter((group) => group.trips.length > 0);

  let position = 0;

  return (
    <>
      {/* One grid, however wide the surface is: three across the home on a
          desktop, one down a phone. A group is a line across it, not a
          section of its own. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
        <SuitcaseCard trips={trips} />
        {groups.map((group) => (
          <Fragment key={group.phase}>
            <h3 className="col-span-full flex items-center gap-4 pt-3 text-sm font-medium text-text-secondary">
              {l.groups[group.phase]}
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </h3>
            {group.trips.map((trip) => {
              const leaving = trip.id === leavingId;
              const delay = position++ * STAGGER_MS;
              return (
                <div
                  key={trip.id}
                  data-leaving={leaving || undefined}
                  className={cn(
                    "max-h-[180px] overflow-hidden transition-all duration-300",
                    leaving && "max-h-0 scale-[0.97] opacity-0"
                  )}
                >
                  <TripCard
                    trip={trip}
                    onRename={trip.phase === "upcoming" ? () => setRenaming(trip) : undefined}
                    onDelete={() => setDeleting(trip)}
                    className="animate-fade-up"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <RenameTripDialog
        trip={renaming}
        onSave={(title) => rename(renaming?.id ?? "", title)}
        onClose={() => setRenaming(null)}
      />

      <ConfirmDelete
        trip={deleting}
        onConfirm={() => confirmDelete(deleting?.id ?? "")}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
