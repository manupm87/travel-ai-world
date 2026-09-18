"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ChatColumn } from "@/components/planner/v2/ChatColumn";
import { DemoBanner } from "@/components/planner/v2/DemoBanner";
import { MapPlaceholder } from "@/components/planner/v2/MapPlaceholder";
import { PlannerLayout } from "@/components/planner/v2/PlannerLayout";
import { TripPanel } from "@/components/planner/v2/TripPanel";
import { useLanguage } from "@/context/LanguageContext";
import { partOf } from "@/hooks/plannerReducer";
import { usePlanner } from "@/hooks/usePlanner";
import { interpolate } from "@/i18n";
import type { Slot } from "@/types/planner";

/**
 * The planner page's client side (`/plan/`): layout A from the mockups. The
 * state machine and the network live in `usePlanner`; this component wires
 * the chat column and the trip panel to it and translates error kinds and
 * the canned messages (generate, alternatives) into copy.
 *
 * `?q=<prompt>` (from the landing's `PlannerCard`) is sent as the first turn
 * once, and only when there is no conversation to resume in this tab.
 */
export default function PlannerClientPage() {
  const { t } = useLanguage();
  const query = useSearchParams().get("q");
  const {
    state,
    demo,
    sendMessage,
    answer,
    select,
    remove,
    dismiss,
    toggleShortlist,
    reset,
  } = usePlanner();
  // No backend, or no `/planner` route yet: the recorded session answers
  // instead (TRA-158) and the banner says so, so the page is never "unavailable".
  const unavailable = false;

  const sentQuery = useRef(false);
  const hasMessages = state.messages.length > 0;
  useEffect(() => {
    if (sentQuery.current || !query?.trim() || hasMessages) return;
    sentQuery.current = true;
    sendMessage(query);
  }, [query, hasMessages, sendMessage]);

  const errorText = state.error ? t.plan.errors[state.error] : null;

  const generate = useCallback(() => {
    sendMessage(t.plan.checklist.generateMessage);
  }, [sendMessage, t]);

  const askAlternatives = useCallback(
    (slot: Slot) => {
      // The stay card's "Change" uses the day-0 pseudo-slot (TripPanel).
      if (slot.day === 0) {
        sendMessage(t.plan.alternatives.askStayMessage);
        return;
      }
      sendMessage(
        interpolate(t.plan.alternatives.askMessage, {
          day: slot.day,
          part: t.plan.parts[partOf(slot)],
        })
      );
    },
    [sendMessage, t]
  );

  return (
    <PlannerLayout
      banner={demo ? <DemoBanner /> : null}
      chat={
        <ChatColumn
          state={state}
          errorText={errorText}
          unavailable={unavailable}
          onSend={sendMessage}
          onAnswer={answer}
          onSelect={select}
          onDismiss={dismiss}
          onToggleShortlist={toggleShortlist}
        />
      }
      panel={
        <TripPanel
          state={state}
          onGenerate={generate}
          onRemove={remove}
          onSelect={select}
          onDismiss={dismiss}
          onToggleShortlist={toggleShortlist}
          onAskAlternatives={askAlternatives}
          onReset={reset}
        />
      }
      map={<MapPlaceholder itinerary={state.itinerary} />}
    />
  );
}
