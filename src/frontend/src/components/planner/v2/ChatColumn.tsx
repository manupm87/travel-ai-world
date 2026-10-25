"use client";

/** The planner's chat column. */

import { Fragment, useState } from "react";
import { RotateCcw } from "lucide-react";
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
  /** No ai_api configured: the composer explains instead of failing silently. */
  unavailable: boolean;
  /** Covered cities for the starter chips and destination hint; empty uses the default copy. */
  cities?: PlannerCity[];
  onSend: (text: string) => void;
  onAnswer: (patch: Partial<TripBrief>, text: string) => void;
  onSelect: (groupId: string, cardIds: string[], slot?: Slot) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
  /** The open trip is ongoing or past: a notice replaces the composer. */
  lockedPhase?: LockedPhase | null;
  /** From the notice: leave this trip where it is and start another. */
  onNewTrip?: () => void;
  /** "Retry" on lost luggage: sends the failed turn again. */
  onRetry?: () => void;
  /** "Undo changes": restores the itinerary from before the last typed turn; absent hides it. */
  onUndo?: () => void;
  /**
   * The URL names a trip not yet in the planner (loading, not found or failed). The transcript
   * in state may belong to another trip, so the column shows none of it and takes no turn.
   */
  holding?: boolean;
}

/**
 * Whether ai_api refuses every turn: the account is off the access list, or today's quota is
 * spent and not yet reset (an unknown reset time holds until a reload).
 */
export function turnsRefused(
  state: Pick<PlannerState, "error" | "quotaResetsAt">,
  now: number = Date.now()
): boolean {
  if (state.error === "denied") return true;
  if (state.error !== "quota") return false;
  const resetsAt = state.quotaResetsAt ? Date.parse(state.quotaResetsAt) : NaN;
  return Number.isNaN(resetsAt) || now < resetsAt;
}

/** The most missing brief fields the luggage tag lists; with more it is hidden. */
const TAG_MAX_MISSING = 2;

/**
 * The planner's left column: transcript, quick replies, suggestions and composer.
 * It renders state and reports intent; `usePlanner` owns every transition.
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
  onUndo,
  holding = false,
}: ChatColumnProps) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  /** The turn an undo was made on; "Changes undone" is announced until the next one. */
  const [undoneTurn, setUndoneTurn] = useState<number | null>(null);
  const { ref: textareaRef, resize } = useAutoResizeTextarea(input, TEXTAREA_MAX_PX);
  const { ref: logRef, onScroll } = useStickToBottom<HTMLDivElement>(state.messages, {
    pinKey: state.turn,
  });

  const isStreaming = state.status === "streaming";
  // no timer: the composer returns on the first render after the quota resets
  const refused = turnsRefused(state);
  const canSubmit = input.trim().length > 0 && !isStreaming && !unavailable && !holding && !refused;
  // nothing while holding, so another trip's draft never paints before it is dropped
  const messages = holding ? [] : state.messages;

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming || unavailable || holding || turnsRefused(state)) return;
    onSend(text);
    setInput("");
  };

  // shown once the typed turn has ended: under its last text bubble, or at the log's foot
  const undo = onUndo && !holding && !lockedPhase && state.undo?.settled ? state.undo : null;
  const undoAnchored = !!undo && messages.some((m) => m.id === undo.messageId);
  const undoChanges = () => {
    if (isStreaming || !onUndo) return;
    onUndo();
    setUndoneTurn(state.turn);
    // the button unmounts; on touch screens a focused composer would open the keyboard
    if (window.matchMedia?.("(pointer: fine)")?.matches) textareaRef.current?.focus();
    else logRef.current?.focus({ preventScroll: true });
  };
  const undoButton = undo && (
    <button
      type="button"
      onClick={undoChanges}
      disabled={isStreaming}
      className="-mt-2 inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg px-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 pointer-coarse:min-h-11"
    >
      <RotateCcw size={14} aria-hidden="true" />
      {t.planner.undoChanges}
    </button>
  );

  const lastIndex = messages.length - 1;
  const showError = !!errorText && !holding;
  const showQuickReplies =
    !isStreaming && !hasItinerary(state.itinerary) && !lockedPhase && !holding;
  // a turn that ended asking for the brief: the quick replies are the answer
  const asking = showQuickReplies && messages.length > 0 && state.missing.length > 0;
  // the luggage tag shows only once a field or two are left; an uncovered destination counts
  const showTag = asking && state.missing.length <= TAG_MAX_MISSING;

  // the suitcase sits under what started the last turn; a turn that ended asking drops it
  const packing =
    !holding && state.packing && !state.packing.failed && !(asking && !state.packing.folded)
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
  // on a choosing turn the suitcase shows the newest question's options
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

  // Kiri's name tag opens each of her turns; the last turn's tag is on its packing
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
            // while packing, the suitcase is the progress indicator
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
            // unplaced cards ask which of these days they join
            itinerary={state.itinerary}
            disabled={isStreaming || refused}
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
        // focusable from script only, for "Undo changes" on touch screens
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col gap-4 scrollbar-none overflow-y-auto overscroll-y-contain px-1 focus:outline-none"
      >
        {packingStatus && turnStart === -1 && packingStatus}
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {renderEntry(message, index)}
            {undoAnchored && message.id === undo?.messageId && undoButton}
            {index === turnStart && packingStatus}
          </Fragment>
        ))}

        {!undoAnchored && undoButton}
        {undoneTurn === state.turn && (
          // announced through the polite live region, not shown
          <p className="sr-only">{t.planner.changesUndone}</p>
        )}

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
            disabled={refused}
            onAnswer={onAnswer}
          />
        )}

        {lockedPhase && state.messages.length === 0 && (
          // without a transcript the notice is centred rather than at the foot
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
            disabled={isStreaming || unavailable || holding || refused}
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
            // the pane is one phone screen tall; three rows would push the transcript out
            compact
          />
        </>
      )}
    </div>
  );
}
