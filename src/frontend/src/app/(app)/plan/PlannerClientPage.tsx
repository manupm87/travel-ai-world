"use client";

/** The planner page: the chat, the trip panel and the map around `usePlanner`. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatColumn } from "@/components/planner/v2/ChatColumn";
import { DemoBanner } from "@/components/planner/v2/DemoBanner";
import { toMapStops, toOptionMarks } from "@/components/planner/v2/mapStops";
import { plannerErrorText } from "@/components/planner/v2/plannerErrorText";
import { PlannerLayout } from "@/components/planner/v2/PlannerLayout";
import { TripMap } from "@/components/planner/v2/TripMap";
import { TripPanel } from "@/components/planner/v2/TripPanel";
import type { OpenTripState } from "@/components/planner/v2/OpenTripNotice";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { usePlanner, type AskAlternativesOptions } from "@/hooks/usePlanner";
import { useSaveTrip } from "@/hooks/useSaveTrip";
import { isTripId, useTrip } from "@/hooks/useTrip";
import { findCity, usePlannerCities } from "@/hooks/usePlannerCities";
import { useSelectedDay } from "@/hooks/useSelectedDay";
import { clearPlannerDraft, readSavedTripId } from "@/services/plannerDraft";
import { tripToDraft } from "@/services/tripDraft";
import type { Slot } from "@/types/planner";
import { isEditable } from "@/types/trip";

/**
 * The planner page (`/plan/`): wires `usePlanner` to the chat column, trip panel and map.
 * `?q=` starts a new trip with that first ask, `?trip=` opens a saved trip (read-only unless
 * upcoming, ADR 0019), and a bare `/plan/` restores only a draft that was never saved.
 */
export default function PlannerClientPage() {
  const { t, resolved: languageResolved } = useLanguage();
  const { user } = useAuth();
  const { formatWeekdayTime } = useFormatters();
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q");
  const tripParam = params.get("trip");
  // a lazy initializer runs once, before usePlanner and useSaveTrip read the stored draft;
  // clearing later would flash the old conversation and redirect back to `?trip=`
  useState(() => {
    if (tripParam !== null) return null;
    if (query?.trim() || readSavedTripId() !== null) clearPlannerDraft();
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
    retry,
    undoChanges,
  } = usePlanner();
  // null is the trip overview; a number is the day shown by both the panel and the map
  const [selectedDay, setSelectedDay] = useSelectedDay(state.itinerary);
  const { cities } = usePlannerCities();
  // null in demo mode, a static build or for a destination outside the manifest
  const city = useMemo(
    () => findCity(cities, state.brief.destination),
    [cities, state.brief.destination],
  );
  const centre = city?.centre ?? null;

  // a malformed id never reaches the API: useTrip answers "not-found" at once
  const {
    trip,
    status: tripStatus,
    reload: reloadTrip,
  } = useTrip(isTripId(tripParam) ? tripParam : null);

  // starts as the tab's last saved trip, so reopening it keeps the unsaved edits in the draft
  const hydratedRef = useRef<string | null | undefined>(undefined);
  if (hydratedRef.current === undefined) hydratedRef.current = readSavedTripId();

  useEffect(() => {
    if (!trip || hydratedRef.current === trip.id) return;
    hydratedRef.current = trip.id;
    const { draft, tripId } = tripToDraft(trip);
    hydrate(draft, tripId);
  }, [trip, hydrate]);

  // core_api refuses every write on a trip that is not upcoming, so the page offers none
  const lockedPhase = trip && !isEditable(trip.phase) ? trip.phase : null;

  // a demo turn belongs to nobody, so it cannot be saved
  const save = useSaveTrip(state, { enabled: !demo, city, openTripId: tripParam });

  // marking the saved id as hydrated keeps the load effect from overwriting the draft just written
  useEffect(() => {
    const saved = save.tripId;
    if (!saved || saved === tripParam) return;
    hydratedRef.current = saved;
    router.replace(`/plan/?trip=${encodeURIComponent(saved)}`);
  }, [router, save.tripId, tripParam]);
  const newTrip = useCallback(() => {
    hydratedRef.current = null;
    startNew();
    router.replace("/plan/");
  }, [router, startNew]);

  // the tab's own saved trip was deleted elsewhere: its draft belongs to nothing, so drop it
  useEffect(() => {
    if (tripStatus !== "not-found" || tripParam === null) return;
    if (readSavedTripId() !== tripParam) return;
    hydratedRef.current = null;
    startNew();
  }, [tripStatus, tripParam, startNew]);

  // one list for both: the map draws these pins and the panel numbers its cards from it
  const mapStops = useMemo(
    () => toMapStops(state.itinerary, selectedDay),
    [state.itinerary, selectedDay],
  );
  const optionMarks = useMemo(
    () => toOptionMarks(state.groups, state.pendingGroupIds),
    [state.groups, state.pendingGroupIds],
  );
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  // reset while rendering, not in an effect, so no frame rings a stop the new day lacks
  const [stopDay, setStopDay] = useState<number | null>(selectedDay);
  if (stopDay !== selectedDay) {
    setStopDay(selectedDay);
    if (selectedStopId !== null) setSelectedStopId(null);
  }

  // without a backend the recorded demo session answers, so the page is never unavailable
  const unavailable = false;

  // null once the URL's trip is in the planner
  const openTrip: OpenTripState | null =
    tripParam === null || tripStatus === "ready"
      ? null
      : tripStatus === "error"
        ? { status: "error", onRetry: reloadTrip }
        : { status: tripStatus };

  const sentQuery = useRef(false);
  const hasMessages = state.messages.length > 0;
  useEffect(() => {
    // wait for the stored language, or the first turn goes out in the default one
    if (sentQuery.current || !query?.trim() || hasMessages || !languageResolved) return;
    sentQuery.current = true;
    sendMessage(query);
    // the draft holds the ask, so a reload resumes it instead of asking again
    router.replace("/plan/");
  }, [query, hasMessages, sendMessage, languageResolved, router]);

  const errorText = plannerErrorText(t, state, { email: user?.email ?? null, formatWeekdayTime });

  const generate = useCallback(() => {
    // the first itinerary is never undone back to an empty one
    sendMessage(t.plan.checklist.generateMessage, { undoable: false });
  }, [sendMessage, t]);

  // the stay's pseudo-slot (day 0) has no day to name, so it keeps its own sentence
  const askAlternatives = useCallback(
    (slot: Slot, options?: AskAlternativesOptions) => {
      if (slot.day === 0) {
        sendMessage(t.plan.alternatives.askStayMessage, { undoable: false });
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
          onRetry={retry}
          onUndo={undoChanges}
          // hides the transcript so a deleted trip's draft never paints before it is dropped
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
