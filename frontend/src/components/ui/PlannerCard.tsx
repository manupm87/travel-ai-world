"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { isApiAvailable, streamChat, UnauthorizedError } from "@/services/api";
import { Bot, Loader2, Send, User } from "lucide-react";

interface PlannerCardProps {
  transparent?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TEXTAREA_MIN_PX = 72;
const TEXTAREA_MAX_PX = 192;

export default function PlannerCard({ transparent = false }: PlannerCardProps) {
  const { t } = useLanguage();
  const p = t.planner;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiReady = isApiAvailable();
  const canSubmit = input.trim().length > 0 && !isStreaming && apiReady;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_PX) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSendToAI = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !apiReady) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      for await (const chunk of streamChat(trimmed, history)) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      }
    } catch (error) {
      const failure =
        error instanceof UnauthorizedError ? p.errorUnauthorized : p.errorFallback;

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          updated[updated.length - 1] = { ...last, content: failure };
        }
        return updated;
      });
      console.error("Chat error:", error);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
      autoResize();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitKey =
      e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey);
    if (isSubmitKey) {
      e.preventDefault();
      handleSendToAI();
    }
  };

  const sectionClasses = transparent
    ? "bg-transparent py-12"
    : "bg-bg-secondary py-24";

  return (
    <section id="planner" className={sectionClasses}>
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <SectionLabel>{p.label}</SectionLabel>
          <h2 className="text-4xl lg:text-5xl font-medium text-text-primary tracking-[-1px] leading-tight">
            {p.title}
          </h2>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-8 lg:p-10 flex flex-col gap-6">
          {messages.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-3 px-1">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      msg.role === "user" ? "bg-accent/20" : "bg-purple/20"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User size={14} className="text-accent" />
                    ) : (
                      <Bot size={14} className="text-purple" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-accent text-white rounded-br-sm"
                        : "bg-bg-surface text-text-primary border border-border rounded-bl-sm"
                    }`}
                  >
                    {msg.content ||
                      (msg.role === "assistant" && isStreaming && (
                        <span className="inline-flex gap-1 items-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:300ms]" />
                        </span>
                      ))}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="bg-bg-primary border border-border-soft rounded-xl p-4 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10 transition-colors flex flex-col gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={autoResize}
              placeholder={p.placeholder}
              disabled={isStreaming}
              rows={3}
              className="w-full bg-transparent text-[15px] text-text-primary placeholder-text-secondary/50 resize-none focus:outline-none disabled:opacity-60"
              style={{
                minHeight: `${TEXTAREA_MIN_PX}px`,
                maxHeight: `${TEXTAREA_MAX_PX}px`,
              }}
            />
            <div className="flex items-center justify-between border-t border-border-soft pt-3">
              <span className="text-[10px] text-text-secondary/60">
                {p.sendHint}
              </span>
              <button
                type="button"
                onClick={handleSendToAI}
                disabled={!canSubmit}
                aria-label={p.send}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isStreaming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>{p.send}</span>
              </button>
            </div>
          </div>

          {messages.length === 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-medium text-text-secondary tracking-[0.12em] uppercase">
                {p.examplesLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {p.examples.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => handleExampleClick(ex.prompt)}
                    className="border border-border-soft bg-transparent text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/40 rounded-full px-3.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className="mr-1.5">{ex.emoji}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
