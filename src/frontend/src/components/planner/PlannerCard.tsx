"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useChatStream, type ChatErrorKind } from "@/hooks/useChatStream";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { isAiAvailable } from "@/services/http";
import { cn } from "@/utils/cn";
import { ExamplePills } from "./ExamplePills";
import { MessageList } from "./MessageList";
import { PromptComposer, TEXTAREA_MAX_PX } from "./PromptComposer";

interface PlannerCardProps {
  transparent?: boolean;
}

/**
 * The AI trip planner: a prompt composer, example prompts and the streamed
 * transcript. State lives in `useChatStream`; this component only wires the
 * pieces together and translates error kinds into copy.
 */
export default function PlannerCard({ transparent = false }: PlannerCardProps) {
  const { t } = useLanguage();
  const p = t.planner;

  const [input, setInput] = useState("");
  const [sendCount, setSendCount] = useState(0);
  const { messages, isStreaming, error, send } = useChatStream();
  const { ref: textareaRef, resize } = useAutoResizeTextarea(input, TEXTAREA_MAX_PX);

  const apiReady = isAiAvailable();
  const canSubmit = input.trim().length > 0 && !isStreaming && apiReady;

  const errorCopy: Record<ChatErrorKind, string> = {
    unauthorized: p.errorUnauthorized,
    generic: p.errorFallback,
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const text = input;
    setInput("");
    setSendCount((n) => n + 1);
    void send(text);
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
      resize();
    });
  };

  return (
    <section
      id="planner"
      className={cn(transparent ? "bg-transparent py-12" : "bg-bg-secondary py-24")}
    >
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <SectionLabel>{p.label}</SectionLabel>
          <h2 className="text-4xl lg:text-5xl font-medium text-text-primary tracking-[-1px] leading-tight">
            {p.title}
          </h2>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-8 lg:p-10 flex flex-col gap-6">
          {messages.length > 0 && (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              errorText={error ? errorCopy[error] : null}
              pinKey={sendCount}
            />
          )}

          <PromptComposer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            textareaRef={textareaRef}
            onResize={resize}
            isStreaming={isStreaming}
            canSubmit={canSubmit}
            unavailable={!apiReady}
          />

          {messages.length === 0 && <ExamplePills onPick={handleExampleClick} />}
        </div>
      </Container>
    </section>
  );
}
