"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat, type ChatMessage } from "@/services/chat";
import { UnauthorizedError } from "@/services/http";

/** Why the last answer failed; the UI maps it to a translated message. */
export type ChatErrorKind = "unauthorized" | "generic";

/**
 * The planner's chat state machine.
 *
 * - `send(text)` appends the user's message and an empty assistant bubble,
 *   then streams the answer into it. Chunks are coalesced into one React
 *   commit per animation frame instead of one per SSE event.
 * - `abort()` cancels the in-flight stream; it also runs on unmount.
 * - `error` is an error *kind*, never copy: translation stays in the UI.
 */
export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<ChatErrorKind | null>(null);

  /** Latest committed messages, readable from the stable `send` callback. */
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  /** Streamed text not yet committed to React state (flushed once per frame). */
  const pendingRef = useRef("");
  const frameRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const appendToAssistant = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, content: last.content + text }];
    });
  }, []);

  const flushPending = useCallback(() => {
    frameRef.current = null;
    const text = pendingRef.current;
    pendingRef.current = "";
    if (text) appendToAssistant(text);
  }, [appendToAssistant]);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = "";
  }, []);

  useEffect(() => abort, [abort]);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || controllerRef.current) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      // Empty assistant bubbles (a previous failure) are not conversation.
      const history = messagesRef.current.filter((m) => m.content.length > 0);

      setError(null);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ]);
      setIsStreaming(true);

      try {
        try {
          for await (const chunk of streamChat(trimmed, history, {
            signal: controller.signal,
          })) {
            pendingRef.current += chunk;
            frameRef.current ??= requestAnimationFrame(flushPending);
          }
        } finally {
          if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
          flushPending();
        }
      } catch (err) {
        // A cancelled stream (unmount, explicit abort) is not a failure.
        if (!controller.signal.aborted) {
          setError(err instanceof UnauthorizedError ? "unauthorized" : "generic");
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setIsStreaming(false);
      }
    },
    [flushPending]
  );

  return { messages, isStreaming, error, send, abort };
}
