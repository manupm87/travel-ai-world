"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatColumn } from "@/components/planner/v2/ChatColumn";
import { DemoBanner } from "@/components/planner/v2/DemoBanner";
import { toMapStops } from "@/components/planner/v2/mapStops";
import { PlannerLayout } from "@/components/planner/v2/PlannerLayout";
import { TripMap } from "@/components/planner/v2/TripMap";
import { TripPanel } from "@/components/planner/v2/TripPanel";
import { useLanguage } from "@/context/LanguageContext";
import { partOf } from "@/hooks/plannerReducer";
import { usePlanner } from "@/hooks/usePlanner";
import { findCity, usePlannerCities } from "@/hooks/usePlannerCities";
import { useSelectedDay } from "@/hooks/useSelectedDay";
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
  // The itinerary opens on the trip overview (`null`, TRA-177) and is then
  // browsed one day at a time: the panel's strip picks the day and the map
  // maps that same day (TRA-176).
  const [selectedDay, setSelectedDay] = useSelectedDay(state.itinerary);
  // The covered cities, for the starter chips, the destination hint, where the
  // map opens and what the overview says about the destination; the built-in
  // copy stands in until they arrive (or when they never do).
  const { cities } = usePlannerCities();

  // One walk of the itinerary for both columns (TRA-147): the map draws these
  // pins and the panel numbers its cards from the very same list.
  const mapStops = useMemo(
    () => toMapStops(state.itinerary, selectedDay),
    [state.itinerary, selectedDay]
  );
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  // A pin belongs to the day it was picked on, so the next day — and the
  // overview, which has no map at all — starts with none. Adjusted while
  // rendering, as `useSelectedDay` adjusts the day: React re-runs this
  // component before touching the DOM, so neither the panel nor the map ever
  // paints a ring around a card the new day does not have.
  const [stopDay, setStopDay] = useState<number | null>(selectedDay);
  if (stopDay !== selectedDay) {
    setStopDay(selectedDay);
    if (selectedStopId !== null) setSelectedStopId(null);
  }

  // The destination as `ai_api` publishes it (TRA-168, TRA-182): where the map
  // looks before the day has any coordinates, and the photo and description
  // the overview leads with. `null` whenever the list has no such city — demo
  // mode, a static build, a destination outside the manifest.
  const city = useMemo(
    () => findCity(cities, state.brief.destination),
    [cities, state.brief.destination]
  );
  const centre = city?.centre ?? null;
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
          cities={cities}
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
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          city={city}
          mapStops={mapStops}
          selectedStopId={selectedStopId}
          onSelectStop={setSelectedStopId}
          onGenerate={generate}
          onRemove={remove}
          onSelect={select}
          onDismiss={dismiss}
          onToggleShortlist={toggleShortlist}
          onAskAlternatives={askAlternatives}
          onReset={reset}
        />
      }
      // The overview spans this column and the trip's: there is no whole-trip
      // map (TRA-177), so the slot is empty until a day is picked.
      map={
        selectedDay === null ? null : (
          <TripMap
            stops={mapStops}
            selectedDay={selectedDay}
            centre={centre}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
          />
        )
      }
    />
  );
}
