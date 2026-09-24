"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { partOf, type OptionGroupState } from "@/hooks/plannerReducer";
import type { AskAlternativesOptions } from "@/hooks/usePlanner";
import type { Slot } from "@/types/planner";
import { OptionCard } from "./OptionCard";

export interface AlternativesSheetProps {
  open: boolean;
  slot: Slot | null;
  /** The latest options group for that slot, or null when none has arrived yet. */
  group: OptionGroupState | null;
  /** Ids already in that slot: shown as `current`. */
  currentIds: string[];
  shortlist: string[];
  disabled?: boolean;
  /** The options for this slot are on their way (a turn is streaming). */
  loading?: boolean;
  onClose: () => void;
  onSelect: (groupId: string, cardIds: string[], slot?: Slot) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
  /** Asks for this slot again: guided by the box, or the next page ("More"). */
  onAskAlternatives: (slot: Slot, options?: AskAlternativesOptions) => void;
}

/**
 * "Change": the alternatives for one slot of the itinerary, as a right side
 * sheet on desktop and a bottom sheet below `lg`. The picking itself is the
 * carousel's `OptionCard`, so a choice means the same thing in both places.
 *
 * Two ways to ask again (TRA-184): the box at the top searches for what the
 * traveller types instead ("a thermal bath"), which starts the list over, and
 * "More options" appends the next three below the ones already there — the
 * spinner then sits at the end of the list rather than replacing it. The box is
 * for a slot of a day; the stay's sheet keeps only its footer.
 */
export function AlternativesSheet({
  open,
  slot,
  group,
  currentIds,
  shortlist,
  disabled = false,
  loading = false,
  onClose,
  onSelect,
  onDismiss,
  onToggleShortlist,
  onAskAlternatives,
}: AlternativesSheetProps) {
  const { t } = useLanguage();
  const titleId = useId();
  const [guidance, setGuidance] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const visible = open && slot !== null;

  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    restoreRef.current = previous instanceof HTMLElement ? previous : null;
    closeRef.current?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      // `aria-modal` promises a focus trap: Tab cycles inside the sheet.
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // The page behind a modal sheet does not scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [visible, onClose]);

  if (!visible || !slot) return null;

  const a = t.plan.alternatives;
  // The stay is changed through the pseudo-slot `{ day: 0, part: null }`:
  // there is no day to name, so the sheet falls back to the stay's own label.
  const isStay = slot.day <= 0;
  const heading = isStay
    ? t.plan.panel.stayNoNights
    : interpolate(a.slot, { day: slot.day, part: t.plan.parts[partOf(slot)] });
  const cards = group ? group.cards.filter((card) => !group.dismissedIds.includes(card.id)) : [];

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 animate-fade-in bg-bg-primary/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] animate-slide-in-up flex-col rounded-t-2xl border border-border bg-bg-card shadow-accent-glow lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:animate-slide-in-right lg:rounded-none lg:rounded-l-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
              {a.title}
            </span>
            <h2 id={titleId} className="text-base font-medium text-text-primary">
              {heading}
            </h2>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label={a.close}
            className="shrink-0 rounded-lg p-1.5 text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {isStay ? null : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const asked = guidance.trim();
              if (!asked) return;
              onAskAlternatives(slot, { guidance: asked });
              setGuidance("");
            }}
            className="flex items-center gap-2 border-b border-border px-4 py-3"
          >
            <input
              type="text"
              value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder={a.guidePlaceholder}
              aria-label={a.guidePlaceholder}
              disabled={disabled}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-base sm:text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || guidance.trim().length === 0}
              className="shrink-0 rounded-lg bg-action px-3 py-1.5 text-xs font-medium text-on-action transition hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {a.guideSubmit}
            </button>
          </form>
        )}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4 py-4">
          {group
            ? cards.map((card) => (
                <OptionCard
                  key={card.id}
                  card={card}
                  slot={isStay ? null : slot}
                  selection="single"
                  current={currentIds.includes(card.id)}
                  selected={group.selectedIds.includes(card.id)}
                  shortlisted={shortlist.includes(card.id)}
                  disabled={disabled}
                  onChoose={() => {
                    // The sheet always knows the slot; the stay's pseudo-slot
                    // names no day, so it travels as none (TRA-185).
                    onSelect(group.group_id, [card.id], isStay ? undefined : slot);
                    onClose();
                  }}
                  onDismiss={() => onDismiss(group.group_id, card.id)}
                  onToggleShortlist={() => onToggleShortlist(card.id)}
                  className="w-full"
                />
              ))
            : null}
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-text-secondary">
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
              />
              {a.loading}
            </p>
          ) : cards.length === 0 ? (
            <p className="text-sm text-text-secondary">{a.none}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3">
          <span className="text-xs text-text-secondary">
            {interpolate(a.shortlist, { count: shortlist.length })}
          </span>
          <button
            type="button"
            onClick={() => onAskAlternatives(slot, { more: true })}
            disabled={disabled}
            className="rounded-lg px-2 py-1 text-xs font-medium text-accent transition hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {a.more}
          </button>
        </div>
      </div>
    </>
  );
}
