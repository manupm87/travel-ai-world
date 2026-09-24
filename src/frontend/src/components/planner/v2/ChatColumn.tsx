"use client";

import { Fragment, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { hasItinerary, type PlannerMessage, type PlannerState } from "@/hooks/plannerReducer";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import type { PlannerCity, Slot, TripBrief } from "@/types/planner";
import { MessageBubble } from "../MessageBubble";
import { PromptComposer, TEXTAREA_MAX_PX } from "../PromptComposer";
import { BoardingPass } from "./BoardingPass";
import { LockedNotice, type LockedPhase } from "./LockedNotice";
import { LostLuggage } from "./LostLuggage";
import { LuggageTag } from "./LuggageTag";
import { OptionCarousel } from "./OptionCarousel";
import { PackingStatus } from "./PackingStatus";
import { QuickReplies } from "./QuickReplies";
import { SelectionChip } from "./SelectionChip";
import { SuggestionChips } from "./SuggestionChips";

export interface ChatColumnProps {
  state: PlannerState;
  /** Translated failure copy for the last turn, or null. */
  errorText: string | null;
  /** No ai_api configured: explain instead of failing silently (show t.plan.errors.unavailable via PromptComposer's `unavailable`). */
  unavailable: boolean;
  /** The cities the planner covers: starter chips and the destination hint
   *  come from them; empty while loading or without a backend (default copy). */
  cities?: PlannerCity[];
  onSend: (text: string) => void;
  onAnswer: (patch: Partial<TripBrief>, text: string) => void;
  onSelect: (groupId: string, cardIds: string[], slot?: Slot) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
  /**
   * The trip on screen is happening now or is over (TRA-196): there is
   * nothing to send, so the notice takes the composer's place. `null` is the
   * planner as it always was.
   */
  lockedPhase?: LockedPhase | null;
  /** From the notice: leave this trip where it is and start another. */
  onNewTrip?: () => void;
  /** "Retry" on lost luggage: the failed turn, sent again (TRA-239). */
  onRetry?: () => void;
  /**
   * The URL names a trip that is not in the planner yet: loading, not found
   * or failed (TRA-223). The transcript in state may be another trip's — a
   * deleted one's included — so the column shows none of it and takes no
   * turn until the trip panel has something to show.
   */
  holding?: boolean;
}

/**
 * The planner page's left column: the transcript (bubbles, "Chosen" chips and
 * option carousels), the structured quick replies when the brief is still
 * incomplete, the shortcut suggestions and the composer. It renders state and
 * reports intent; `usePlanner` owns every transition.
 */
export function ChatColumn({
  state,
  errorText,
  unavailable,
  cities = [],
  onSend,
  onAnswer,
  onSelect,
  onDismiss,
  onToggleShortlist,
  lockedPhase = null,
  onNewTrip,
  onRetry,
  holding = false,
}: ChatColumnProps) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const { ref: textareaRef, resize } = useAutoResizeTextarea(input, TEXTAREA_MAX_PX);
  const { ref: logRef, onScroll } = useStickToBottom<HTMLDivElement>(state.messages, {
    pinKey: state.turn,
  });

  const isStreaming = state.status === "streaming";
  const canSubmit = input.trim().length > 0 && !isStreaming && !unavailable && !holding;
  // What the log shows: nothing at all while holding, so a draft that belongs
  // to some other trip never paints for the beat before it is dropped.
  const messages = holding ? [] : state.messages;

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming || unavailable || holding) return;
    onSend(text);
    setInput("");
  };

  const lastIndex = messages.length - 1;
  /** The error never hides: it is lost luggage at the foot of the log. */
  const showError = !!errorText && !holding;
  const showQuickReplies =
    !isStreaming && !hasItinerary(state.itinerary) && !lockedPhase && !holding;
  // Kiri's luggage tag over the quick replies whenever a turn ends asking
  // (TRA-239) — a destination outside the corpus included, which ai_api
  // clears, so the tag then says "To decide" on its title too (TRA-243).
  const showTag = showQuickReplies && messages.length > 0 && state.missing.length > 0;

  // Packing the suitcase (TRA-239) belongs to the last turn: it sits under what
  // started it — the traveller's message or the chip of what they chose. A
  // turn that ended asking packed nothing, so once it is over its suitcase
  // gives way to the luggage tag instead of closing (TRA-243).
  const packing =
    !holding && state.packing && !state.packing.failed && !(showTag && !state.packing.folded)
      ? state.packing
      : null;
  let turnStart = -1;
  for (let i = lastIndex; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.kind === "selection" || (message?.kind === "text" && message.role === "user")) {
      turnStart = i;
      break;
    }
  }
  // On a turn that is choosing rather than drafting, the suitcase shows the
  // newest question's options (TRA-242).
  const newestGroup = state.groups[state.pendingGroupIds[state.pendingGroupIds.length - 1] ?? ""];
  const optionTitles = newestGroup ? newestGroup.cards.map((card) => card.title) : [];
  const packingStatus = packing && (
    <PackingStatus
      packing={packing}
      streaming={isStreaming}
      brief={state.brief}
      itinerary={state.itinerary}
      optionTitles={optionTitles}
      key={`packing-${state.turn}`}
    >
      {packing.step === "zip" && packing.folded && hasItinerary(state.itinerary) && (
        <BoardingPass brief={state.brief} itinerary={state.itinerary} />
      )}
    </PackingStatus>
  );

  // Kiri's name tag opens each of her turns; the last one's is on its packing.
  const tagged = new Set<number>();
  let opened = true;
  messages.forEach((message, index) => {
    if (message.kind === "selection" || (message.kind === "text" && message.role === "user")) {
      opened = false;
      return;
    }
    if (message.kind === "text" && message.role === "assistant" && !opened) {
      opened = true;
      if (!(packing && index > turnStart)) tagged.add(index);
    }
  });

  const renderEntry = (message: PlannerMessage, index: number) => {
    switch (message.kind) {
      case "text": {
        const isLast = index === lastIndex;
        const isLastAssistant = isLast && message.role === "assistant";
        return (
          <MessageBubble
            message={{ role: message.role, content: message.content }}
            // While Kiri packs, the packing is what says she is working.
            isPending={isLastAssistant && !message.content && isStreaming && !packing}
            showTag={tagged.has(index)}
          />
        );
      }
      case "selection":
        return <SelectionChip titles={message.titles} />;
      case "options": {
        const group = state.groups[message.groupId];
        if (!group) return null;
        return (
          <OptionCarousel
            group={group}
            shortlist={state.shortlist}
            // Unplaced cards ask which day they join, out of these (TRA-185).
            itinerary={state.itinerary}
            disabled={isStreaming}
            onSelect={onSelect}
            onDismiss={onDismiss}
            onToggleShortlist={onToggleShortlist}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {messages.length === 0 && !lockedPhase && !holding && (
        <p className="text-sm leading-relaxed text-text-secondary">{t.plan.subtitle}</p>
      )}

      <div
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-4 scrollbar-none overflow-y-auto overscroll-y-contain px-1"
      >
        {packingStatus && turnStart === -1 && packingStatus}
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {renderEntry(message, index)}
            {index === turnStart && packingStatus}
          </Fragment>
        ))}

        {showError && (
          <LostLuggage
            errorText={errorText}
            onRetry={state.error === "generic" ? onRetry : undefined}
          />
        )}

        {showTag && <LuggageTag brief={state.brief} missing={state.missing} />}

        {showQuickReplies && (
          <QuickReplies
            brief={state.brief}
            missing={state.missing}
            destinationPlaceholder={cities[0]?.name}
            onAnswer={onAnswer}
          />
        )}

        {lockedPhase && state.messages.length === 0 && (
          // A reopened trip has no transcript: the notice is the column's one
          // resident, so it sits in the middle rather than at the foot of a void.
          <div className="my-auto w-full max-w-sm self-center">
            <LockedNotice phase={lockedPhase} onNewTrip={onNewTrip ?? (() => {})} />
          </div>
        )}
      </div>

      {lockedPhase ? (
        state.messages.length > 0 && (
          <LockedNotice phase={lockedPhase} onNewTrip={onNewTrip ?? (() => {})} />
        )
      ) : (
        <>
          <SuggestionChips
            onPick={onSend}
            disabled={isStreaming || unavailable || holding}
            cities={cities}
            showStarters={messages.length === 0}
          />

          <PromptComposer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            textareaRef={textareaRef}
            onResize={resize}
            isStreaming={isStreaming}
            canSubmit={canSubmit}
            unavailable={unavailable}
            placeholder={t.plan.composerPlaceholder}
            // The pane is one phone screen tall: a three-row composer would push
            // the transcript out of it (TRA-187).
            compact
          />
        </>
      )}
    </div>
  );
}
