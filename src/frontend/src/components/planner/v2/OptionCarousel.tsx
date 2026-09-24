"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { EMPTY_ITINERARY, type ItineraryDraft, type OptionGroupState } from "@/hooks/plannerReducer";
import type { Slot } from "@/types/planner";
import { OptionCard } from "./OptionCard";
import { SlotPicker } from "./SlotPicker";

export interface OptionCarouselProps {
  group: OptionGroupState;
  /** Hearted card ids (local only). */
  shortlist: string[];
  /** The trip so far: the days an unplaced card can be added to (TRA-185). */
  itinerary?: ItineraryDraft;
  /** A turn is streaming: the choice buttons wait. */
  disabled?: boolean;
  onSelect: (groupId: string, cardIds: string[], slot?: Slot) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
}

/** One card plus the gap: how far the arrows scroll when there is no layout. */
const CARD_STEP_PX = 272;

/**
 * The primary ("Choose" / "Add to day…") button of a card: the only button in
 * it that is not the shortlist heart, which carries `aria-pressed`.
 */
function primaryButtonOf(item: Element | null): HTMLElement | null {
  return item?.querySelector<HTMLElement>("button:not([aria-pressed])") ?? null;
}

/**
 * A horizontal carousel of options inside the transcript. Single-selection
 * groups commit as soon as a card is chosen; multi-selection groups collect
 * checks and commit with the "Add N" footer.
 */
export function OptionCarousel({
  group,
  shortlist,
  itinerary = EMPTY_ITINERARY,
  disabled = false,
  onSelect,
  onDismiss,
  onToggleShortlist,
}: OptionCarouselProps) {
  const { t } = useLanguage();
  const p = t.plan;
  const listRef = useRef<HTMLUListElement>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [pickingBatch, setPickingBatch] = useState(false);

  const isMulti = group.selection === "multi";
  // Cards an answer or a day-less search brought back (`found:` groups,
  // TRA-185): they carry no slot, so the traveller names one. Neighbourhoods
  // and hotels also carry none, but they are not added to a day at all.
  const unplaced =
    group.slot === null && (group.kind === "experience" || group.kind === "restaurant");
  const pickSlot = unplaced ? itinerary : null;
  const days = itinerary.days.map((day) => day.day);
  const hasSelection = group.selectedIds.length > 0;
  const cards = group.cards.filter((card) => !group.dismissedIds.includes(card.id));

  const scrollByCard = (direction: 1 | -1) => {
    const list = listRef.current;
    if (!list) return;
    const first = list.querySelector("li");
    const width = first?.getBoundingClientRect().width ?? 0;
    const step = width > 0 ? width + 12 : CARD_STEP_PX;
    list.scrollBy?.({ left: direction * step, behavior: "smooth" });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll("li"));
    const current = (event.target as HTMLElement).closest("li");
    const index = current ? items.indexOf(current as HTMLLIElement) : -1;
    if (index < 0) return;
    const next = primaryButtonOf(items[index + (event.key === "ArrowRight" ? 1 : -1)] ?? null);
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  const choose = (cardId: string, slot?: Slot) => {
    if (!isMulti) {
      onSelect(group.group_id, [cardId], slot);
      return;
    }
    setChecked((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]
    );
  };

  const isSelected = (cardId: string) =>
    hasSelection ? group.selectedIds.includes(cardId) : isMulti && checked.includes(cardId);

  return (
    <section
      role="region"
      aria-roledescription={p.carousel.roleDescription}
      aria-label={interpolate(p.carousel.label, { prompt: group.prompt })}
      data-group-id={group.group_id}
      className="flex animate-fade-in flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium text-text-primary">{group.prompt}</h3>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            aria-label={p.carousel.previous}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-soft text-text-secondary transition hover:border-accent/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            aria-label={p.carousel.next}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-soft text-text-secondary transition hover:border-accent/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul
        ref={listRef}
        onKeyDown={handleKeyDown}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, index) => (
          <li key={card.id} className="flex snap-start">
            <OptionCard
              card={card}
              index={index}
              slot={group.slot}
              // A multi group picks one slot for the whole batch, in the footer.
              pickSlot={isMulti ? null : pickSlot}
              selection={group.selection}
              selected={isSelected(card.id)}
              shortlisted={shortlist.includes(card.id)}
              disabled={
                disabled || (hasSelection && (isMulti || !group.selectedIds.includes(card.id)))
              }
              onChoose={(slot) => choose(card.id, slot)}
              onDismiss={() => onDismiss(group.group_id, card.id)}
              onToggleShortlist={() => onToggleShortlist(card.id)}
            />
          </li>
        ))}
      </ul>

      {isMulti && (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            aria-expanded={pickSlot && days.length > 0 ? pickingBatch : undefined}
            onClick={() =>
              pickSlot && days.length > 0
                ? setPickingBatch((open) => !open)
                : onSelect(group.group_id, checked)
            }
            disabled={disabled || hasSelection || checked.length === 0}
            className="self-start rounded-lg bg-action px-3.5 py-2 text-[13px] font-medium text-on-action transition hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {interpolate(p.card.addCount, { count: checked.length })}
          </button>
          {pickSlot && days.length > 0 && pickingBatch && (
            <SlotPicker
              days={days}
              itinerary={pickSlot}
              onPick={(slot) => {
                setPickingBatch(false);
                onSelect(group.group_id, checked, slot);
              }}
              onCancel={() => setPickingBatch(false)}
            />
          )}
        </div>
      )}
    </section>
  );
}
