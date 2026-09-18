"use client";

import { Fragment, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { hasItinerary, type PlannerMessage, type PlannerState } from "@/hooks/plannerReducer";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import type { TripBrief } from "@/types/planner";
import { MessageBubble } from "../MessageBubble";
import { PromptComposer, TEXTAREA_MAX_PX } from "../PromptComposer";
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
  onSend: (text: string) => void;
  onAnswer: (patch: Partial<TripBrief>, text: string) => void;
  onSelect: (groupId: string, cardIds: string[]) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
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
  onSend,
  onAnswer,
  onSelect,
  onDismiss,
  onToggleShortlist,
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
  const showQuickReplies = !isStreaming && !hasItinerary(state.itinerary);

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
      {state.messages.length === 0 && (
        <p className="text-sm leading-relaxed text-text-secondary">{t.plan.subtitle}</p>
      )}

      <div
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1"
      >
        {state.messages.map((message, index) => (
          <Fragment key={message.id}>{renderEntry(message, index)}</Fragment>
        ))}

        {showExtraError && (
          <MessageBubble message={{ role: "assistant", content: "" }} errorText={errorText} />
        )}

        {showQuickReplies && (
          <QuickReplies brief={state.brief} missing={state.missing} onAnswer={onAnswer} />
        )}
      </div>

      <SuggestionChips onPick={onSend} disabled={isStreaming || unavailable} />

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
      />
    </div>
  );
}
