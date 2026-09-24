import type { ChatMessage } from "@/services/chat";
import { cn } from "@/utils/cn";
import { KiriTag } from "./v2/PackingStatus";
import { MarkdownContent } from "./MarkdownContent";
import { TypingDots } from "./TypingDots";

interface MessageBubbleProps {
  message: ChatMessage;
  /** The assistant is still answering into this (empty) bubble. */
  isPending?: boolean;
  /** Translated failure text to show instead of an answer. */
  errorText?: string | null;
  /** Kiri's name tag over an answer that opens a turn (TRA-239). */
  showTag?: boolean;
}

/**
 * One message of the planner's transcript (TRA-239). What the traveller typed
 * is a bubble on the right, shown exactly as typed; what Kiri answers is plain
 * text on the page, Markdown rendered (`**bold**`, `- item`), under her name
 * tag when it opens a turn.
 */
export function MessageBubble({
  message,
  isPending = false,
  errorText,
  showTag = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[85%] rounded-[18px_18px_4px_18px] bg-bg-surface px-4 py-2.5 text-[14.5px] leading-normal text-text-primary">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    );
  }

  const body = message.content ? (
    <MarkdownContent content={message.content} />
  ) : (
    errorText || (isPending && <TypingDots />)
  );
  if (!body) return null;

  return (
    <div className="flex animate-fade-up flex-col gap-2">
      {showTag && <KiriTag />}
      <div
        className={cn("text-[14.5px] leading-relaxed text-text-primary", errorText && "text-error")}
        role={errorText ? "alert" : undefined}
      >
        {body}
      </div>
    </div>
  );
}
