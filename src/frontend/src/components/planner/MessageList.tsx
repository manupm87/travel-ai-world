"use client";

import type { ChatMessage } from "@/services/chat";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** Translated failure text for the last (empty) assistant bubble. */
  errorText?: string | null;
  /** Changes on every send, so the list follows the new reply. */
  pinKey: number;
}

/**
 * Scrollable transcript that follows the stream while the user is at the
 * bottom, and stops following once they scroll up to read.
 */
export function MessageList({ messages, isStreaming, errorText, pinKey }: MessageListProps) {
  const { ref, onScroll } = useStickToBottom<HTMLDivElement>(messages, { pinKey });
  const lastIndex = messages.length - 1;

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="log"
      aria-live="polite"
      className="max-h-80 overflow-y-auto space-y-3 px-1"
    >
      {messages.map((message, i) => {
        const isLastAssistant = i === lastIndex && message.role === "assistant";
        return (
          <MessageBubble
            key={i}
            message={message}
            isPending={isLastAssistant && isStreaming}
            errorText={isLastAssistant && !message.content ? errorText : null}
          />
        );
      })}
    </div>
  );
}
