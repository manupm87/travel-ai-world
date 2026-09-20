"use client";

import { useEffect, useRef, useState } from "react";
import { AskField } from "@/components/landing/AskField";
import { ConfirmDelete } from "@/components/dashboard/ConfirmDelete";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import { TripEditSheet } from "@/components/dashboard/TripEditSheet";
import { TripGrid } from "@/components/dashboard/TripGrid";
import { TripGridSkeleton } from "@/components/dashboard/TripGridSkeleton";
import { Container } from "@/components/ui/Container";
import { useLanguage } from "@/context/LanguageContext";
import { useTrips } from "@/hooks/useTrips";
import type { TripSummary } from "@/types/trip-summary";

/** How long the card takes to collapse before it leaves the list. */
const COLLAPSE_MS = 300;

/**
 * The dashboard: the field that starts a trip, then the trips themselves.
 *
 * The same `AskField` as the landing sits on top — a returning visitor's next
 * trip starts the way their first one did — and under it the account's trips
 * in one grid, grouped by what is coming, what is being planned and what is
 * over. A card's ⋯ menu opens the edit sheet or the delete confirmation;
 * `useTrips` owns the writes (optimistic delete with a rollback, a patch that
 * replaces the card with what the API stored) and this page only decides which
 * dialog is open and which card is collapsing.
 *
 * The dusk horizon behind it comes from the shell (`AppAurora`), which the
 * planner — the one page in this group with a background of its own — leaves
 * out.
 */
export default function DashboardClientPage() {
  const { t } = useLanguage();
  const { trips, status, reload, remove, update } = useTrips();

  const [editing, setEditing] = useState<TripSummary | null>(null);
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

  return (
    <>
      <AskField variant="inline" />

      <Container className="flex flex-col gap-6 px-4 pb-20 sm:px-8">
        <h2 className="text-2xl font-light text-text-primary">{t.dashboard.title}</h2>

        {status === "loading" && <TripGridSkeleton />}

        {status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-center rounded-2xl border border-glass-border bg-glass-bg px-6 py-14 text-center backdrop-blur-xl"
          >
            <h3 className="text-xl font-medium text-text-primary">{t.dashboard.errorTitle}</h3>
            <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-text-secondary">
              {t.dashboard.errorDescription}
            </p>
            <button
              type="button"
              onClick={reload}
              className="mt-6 rounded-lg border border-glass-border bg-glass-bg px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
            >
              {t.dashboard.retry}
            </button>
          </div>
        )}

        {status === "ready" &&
          (trips.length === 0 ? (
            <EmptyDashboard />
          ) : (
            <TripGrid
              trips={trips}
              leavingId={leavingId}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
      </Container>

      {editing && (
        <TripEditSheet
          trip={editing}
          onSave={(patch) => update(editing.id, patch)}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDelete
          trip={deleting}
          onConfirm={() => confirmDelete(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
