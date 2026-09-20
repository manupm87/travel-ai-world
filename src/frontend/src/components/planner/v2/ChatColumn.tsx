"use client";

import { Fragment, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { hasItinerary, type PlannerMessage, type PlannerState } from "@/hooks/plannerReducer";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import type { PlannerCity, Slot, TripBrief } from "@/types/planner";
import { MessageBubble } from "../MessageBubble";
import { PromptComposer, TEXTAREA_MAX_PX } from "../PromptComposer";
import { LockedNotice, type LockedPhase } from "./LockedNotice";
import { OptionCarousel } from "./OptionCarousel";
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
}

function isEmptyAssistant(message: PlannerMessage | undefined): boolean {
  return message?.kind === "text" && message.role === "assistant" && message.content === "";
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
}: ChatColumnProps) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const { ref: textareaRef, resize } = useAutoResizeTextarea(input, TEXTAREA_MAX_PX);
  const { ref: logRef, onScroll } = useStickToBottom<HTMLDivElement>(state.messages, {
    pinKey: state.turn,
  });

  const isStreaming = state.status === "streaming";
  const canSubmit = input.trim().length > 0 && !isStreaming && !unavailable;

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming || unavailable) return;
    onSend(text);
    setInput("");
  };

  const lastIndex = state.messages.length - 1;
  const lastIsEmptyAssistant = isEmptyAssistant(state.messages[lastIndex]);
  /** The error never hides: without an empty bubble to fill, add one. */
  const showExtraError = !!errorText && !lastIsEmptyAssistant;
  const showQuickReplies = !isStreaming && !hasItinerary(state.itinerary) && !lockedPhase;

  const renderEntry = (message: PlannerMessage, index: number) => {
    switch (message.kind) {
      case "text": {
        const isLast = index === lastIndex;
        const isLastAssistant = isLast && message.role === "assistant";
        return (
          <MessageBubble
            message={{ role: message.role, content: message.content }}
            isPending={isLastAssistant && !message.content && isStreaming}
            errorText={isLastAssistant && !message.content ? errorText : null}
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
      {state.messages.length === 0 && !lockedPhase && (
        <p className="text-sm leading-relaxed text-text-secondary">{t.plan.subtitle}</p>
      )}

      <div
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain px-1"
      >
        {state.messages.map((message, index) => (
          <Fragment key={message.id}>{renderEntry(message, index)}</Fragment>
        ))}

        {showExtraError && (
          <MessageBubble message={{ role: "assistant", content: "" }} errorText={errorText} />
        )}

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
            disabled={isStreaming || unavailable}
            cities={cities}
            showStarters={state.messages.length === 0}
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
