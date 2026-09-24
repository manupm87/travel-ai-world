import { Bot, User } from "lucide-react";
import type { ChatMessage } from "@/services/chat";
import { cn } from "@/utils/cn";
import { MarkdownContent } from "./MarkdownContent";
import { TypingDots } from "./TypingDots";

interface MessageBubbleProps {
  message: ChatMessage;
  /** The assistant is still answering into this (empty) bubble. */
  isPending?: boolean;
  /** Translated failure text to show instead of an answer. */
  errorText?: string | null;
}

export function MessageBubble({ message, isPending = false, errorText }: MessageBubbleProps) {
  const isUser = message.role === "user";
  /**
   * The assistant writes Markdown (`**bold**`, `- item`), so its bubble is
   * rendered; what the traveller typed is shown exactly as typed.
   */
  const body = message.content ? (
    isUser ? (
      <span className="whitespace-pre-wrap">{message.content}</span>
    ) : (
      <MarkdownContent content={message.content} />
    )
  ) : (
    errorText || (isPending && <TypingDots />)
  );

  return (
    <div className={cn("flex animate-fade-up gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-accent/20" : "bg-purple/20"
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User size={14} className="text-accent" />
        ) : (
          <Bot size={14} className="text-purple" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-action text-on-action rounded-br-sm"
            : "bg-bg-surface text-text-primary border border-border rounded-bl-sm",
          errorText && "text-error"
        )}
        role={errorText ? "alert" : undefined}
      >
        {body}
      </div>
    </div>
  );
}
