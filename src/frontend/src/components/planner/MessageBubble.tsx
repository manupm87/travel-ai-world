import { Bot, User } from "lucide-react";
import type { ChatMessage } from "@/services/chat";
import { cn } from "@/utils/cn";
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

  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
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
            ? "bg-accent text-white rounded-br-sm"
            : "bg-bg-surface text-text-primary border border-border rounded-bl-sm",
          errorText && "text-error"
        )}
        role={errorText ? "alert" : undefined}
      >
        {message.content || errorText || (isPending && <TypingDots />)}
      </div>
    </div>
  );
}
