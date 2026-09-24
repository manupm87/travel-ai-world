"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatColumn } from "@/components/planner/v2/ChatColumn";
import { DemoBanner } from "@/components/planner/v2/DemoBanner";
import { toMapStops, toOptionMarks } from "@/components/planner/v2/mapStops";
import { PlannerLayout } from "@/components/planner/v2/PlannerLayout";
import { TripMap } from "@/components/planner/v2/TripMap";
import { TripPanel } from "@/components/planner/v2/TripPanel";
import type { OpenTripState } from "@/components/planner/v2/OpenTripNotice";
import { useLanguage } from "@/context/LanguageContext";
import { usePlanner, type AskAlternativesOptions } from "@/hooks/usePlanner";
import { useSaveTrip } from "@/hooks/useSaveTrip";
import { isTripId, useTrip } from "@/hooks/useTrip";
import { findCity, usePlannerCities } from "@/hooks/usePlannerCities";
import { useSelectedDay } from "@/hooks/useSelectedDay";
import { clearPlannerDraft, readSavedTripId } from "@/services/plannerDraft";
import { tripToDraft } from "@/services/tripDraft";
import type { Slot } from "@/types/planner";

/**
 * The planner page's client side (`/plan/`): layout A from the mockups. The
 * state machine and the network live in `usePlanner`; this component wires
 * the chat column and the trip panel to it and translates error kinds and
 * the canned messages (generate, the stay's "Change") into copy.
 *
 * `?q=<prompt>` (from the landing's `PlannerCard`) is sent as the first turn
 * once, and only when there is no conversation to resume in this tab.
 *
 * `?trip=<uuid>` opens a saved trip in it (TRA-196): the trip is loaded,
 * rebuilt into a draft by `services/tripDraft.ts` and handed to
 * `usePlanner.hydrate`, and the query stays in the URL so a reload comes back
 * to the same trip — which is also why "Save trip" puts the new id there. A
 * trip that is not upcoming is read-only: core_api refuses every write on it,
 * so the page hides the controls that would be refused (ADR 0019).
 *
 * `/plan/` without `?trip=` is always a new trip (TRA-223). The tab's stored
 * draft is restored there only while it was never saved: once it has a trip
 * id it belongs to that trip, which `?trip=` reopens, so a bare `/plan/` (the
 * home's ask and its "New trip") starts empty instead of being sent back to
 * it. A `?trip=` that is not found and is the tab's own saved trip (deleted
 * elsewhere) drops the draft too, and the pane offers a new trip.
 */
export default function PlannerClientPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q");
  const tripParam = params.get("trip");
  // A bare `/plan/` is a new trip (TRA-223). When the tab still holds the
  // draft of a saved trip, the draft and its id are dropped here, once per
  // mount and before the hooks below read them: `usePlanner` restores the
  // draft in its reducer's initializer and `useSaveTrip` reads the id in its
  // state's, so clearing any later would flash the old conversation and let
  // the redirect effect further down send the page back to `?trip=`. A lazy
  // `useState` initializer is the one place that runs first and only once. A
  // draft that was never saved has no id and is restored, as before.
  useState(() => {
    if (tripParam === null && readSavedTripId() !== null) clearPlannerDraft();
    return null;
  });
  const {
    state,
    demo,
    sendMessage,
    answer,
    select,
    remove,
    askAlternatives: askForSlot,
    dismiss,
    toggleShortlist,
    hydrate,
    startNew,
  } = usePlanner();
  // The itinerary opens on the trip overview (`null`, TRA-177) and is then
  // browsed one day at a time: the panel's strip picks the day and the map
  // maps that same day (TRA-176).
  const [selectedDay, setSelectedDay] = useSelectedDay(state.itinerary);
  // The covered cities, for the starter chips, the destination hint, where the
  // map opens and what the overview says about the destination; the built-in
  // copy stands in until they arrive (or when they never do).
  const { cities } = usePlannerCities();
  // The destination as `ai_api` publishes it (TRA-168, TRA-182): where the map
  // looks before the day has any coordinates, and the photo and description
  // the overview leads with. `null` whenever the list has no such city — demo
  // mode, a static build, a destination outside the manifest.
  const city = useMemo(
    () => findCity(cities, state.brief.destination),
    [cities, state.brief.destination],
  );
  const centre = city?.centre ?? null;

  // The saved trip the URL names, loaded the way the viewer used to load one.
  // An id that is not a trip id never reaches the API: `useTrip` answers
  // "not-found" at once, which is the same answer as somebody else's trip.
  const {
    trip,
    status: tripStatus,
    reload: reloadTrip,
  } = useTrip(isTripId(tripParam) ? tripParam : null);

  // The trip this planner is holding. It starts as whatever this tab last
  // saved, so reopening the very trip whose draft is still in the tab keeps
  // that draft — half-finished edits included — instead of rewinding it to
  // what core_api stored.
  const hydratedRef = useRef<string | null | undefined>(undefined);
  if (hydratedRef.current === undefined) hydratedRef.current = readSavedTripId();

  useEffect(() => {
    if (!trip || hydratedRef.current === trip.id) return;
    hydratedRef.current = trip.id;
    const { draft, tripId } = tripToDraft(trip);
    hydrate(draft, tripId);
  }, [trip, hydrate]);

  // Only an upcoming trip can still be planned; the other two are read.
  // core_api refuses every write on them, so the page offers none.
  const lockedPhase = trip && trip.phase !== "upcoming" ? trip.phase : null;

  // "Save trip". The recorded session answers for everyone and belongs to
  // nobody, so a demo turn takes the button out of service (TRA-191).
  const save = useSaveTrip(state, { enabled: !demo, city, openTripId: tripParam });

  // The trip the draft was saved as belongs in the URL: a reload then opens
  // it instead of restoring an untitled draft beside it. The id is already
  // ours, so marking it here keeps the load effect above from hydrating over
  // the very draft that was just written.
  useEffect(() => {
    const saved = save.tripId;
    if (!saved || saved === tripParam) return;
    hydratedRef.current = saved;
    router.replace(`/plan/?trip=${encodeURIComponent(saved)}`);
  }, [router, save.tripId, tripParam]);
  /**
   * "New trip": an empty planner with no trip to update, and a bare `/plan/`.
   * Offered by a trip that can no longer be planned, by the panel's header
   * while a saved trip is open, and by a trip that is not there at all.
   */
  const newTrip = useCallback(() => {
    hydratedRef.current = null;
    startNew();
    router.replace("/plan/");
  }, [router, startNew]);

  // A `?trip=` that is not found but is the very trip this tab saved: it was
  // deleted (or lost) elsewhere, so the draft kept for it belongs to nothing.
  // It goes with its id, from storage and from the planner, instead of being
  // restored beside a trip that no longer exists. Another missing id leaves
  // the tab's own draft alone.
  useEffect(() => {
    if (tripStatus !== "not-found" || tripParam === null) return;
    if (readSavedTripId() !== tripParam) return;
    hydratedRef.current = null;
    startNew();
  }, [tripStatus, tripParam, startNew]);

  // One walk of the itinerary for both columns (TRA-147): the map draws these
  // pins and the panel numbers its cards from the very same list.
  const mapStops = useMemo(
    () => toMapStops(state.itinerary, selectedDay),
    [state.itinerary, selectedDay],
  );
  // What Kiri is proposing and has not been answered yet, marked on the same
  // map as dashed rings (TRA-238), so the options can be compared by place.
  const optionMarks = useMemo(
    () => toOptionMarks(state.groups, state.pendingGroupIds),
    [state.groups, state.pendingGroupIds],
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

  // No backend, or no `/planner` route yet: the recorded session answers
  // instead (TRA-158) and the banner says so, so the page is never "unavailable".
  const unavailable = false;

  // What the pane says while the URL's trip is on its way, or never arrives.
  // Once it is in the planner there is nothing to report: the trip itself is
  // what the pane shows.
  const openTrip: OpenTripState | null =
    tripParam === null || tripStatus === "ready"
      ? null
      : tripStatus === "error"
        ? { status: "error", onRetry: reloadTrip }
        : { status: tripStatus };

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

  // "Change": the hook writes the ask for a slot of a day — guidance and the
  // ids that ask already showed included (TRA-184). The stay has no day to
  // name, so its pseudo-slot keeps its own sentence.
  const askAlternatives = useCallback(
    (slot: Slot, options?: AskAlternativesOptions) => {
      if (slot.day === 0) {
        sendMessage(t.plan.alternatives.askStayMessage);
        return;
      }
      askForSlot(slot, options);
    },
    [askForSlot, sendMessage, t],
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
          lockedPhase={lockedPhase}
          onNewTrip={newTrip}
          // The panel shows the trip's notice meanwhile; the column shows no
          // transcript until the trip is in the planner, so the draft of a
          // deleted trip is never painted before the effect above drops it.
          holding={openTrip !== null}
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
          onReset={startNew}
          onNewTrip={newTrip}
          openTrip={openTrip}
          lockedPhase={lockedPhase}
          save={save}
        />
      }
      // The map is always behind the trip (TRA-238): the selected day's pins,
      // or on the overview the city alone — `toMapStops` gives it no pins.
      map={
        <TripMap
          stops={mapStops}
          selectedDay={selectedDay}
          centre={centre}
          selectedStopId={selectedStopId}
          onSelectStop={setSelectedStopId}
          options={optionMarks}
        />
      }
    />
  );
}
