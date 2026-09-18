"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { OptionGroupState } from "@/hooks/plannerReducer";
import { OptionCard } from "./OptionCard";

export interface OptionCarouselProps {
  group: OptionGroupState;
  /** Hearted card ids (local only). */
  shortlist: string[];
  /** A turn is streaming: the choice buttons wait. */
  disabled?: boolean;
  onSelect: (groupId: string, cardIds: string[]) => void;
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
  disabled = false,
  onSelect,
  onDismiss,
  onToggleShortlist,
}: OptionCarouselProps) {
  const { t } = useLanguage();
  const p = t.plan;
  const listRef = useRef<HTMLUListElement>(null);
  const [checked, setChecked] = useState<string[]>([]);

  const isMulti = group.selection === "multi";
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

  const choose = (cardId: string) => {
    if (!isMulti) {
      onSelect(group.group_id, [cardId]);
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
              selection={group.selection}
              selected={isSelected(card.id)}
              shortlisted={shortlist.includes(card.id)}
              disabled={
                disabled || (hasSelection && (isMulti || !group.selectedIds.includes(card.id)))
              }
              onChoose={() => choose(card.id)}
              onDismiss={() => onDismiss(group.group_id, card.id)}
              onToggleShortlist={() => onToggleShortlist(card.id)}
            />
          </li>
        ))}
      </ul>

      {isMulti && (
        <button
          type="button"
          onClick={() => onSelect(group.group_id, checked)}
          disabled={disabled || hasSelection || checked.length === 0}
          className="self-start rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {interpolate(p.card.addCount, { count: checked.length })}
        </button>
      )}
    </section>
  );
}
