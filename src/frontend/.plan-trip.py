p = "src/app/(app)/plan/PlannerClientPage.tsx"
s = open(p).read()


def sub(old, new):
    global s
    if old not in s:
        raise SystemExit(f"NOT FOUND: {old[:90]!r}")
    s = s.replace(old, new, 1)


sub(
    """import { useSearchParams } from "next/navigation";""",
    """import { useRouter, useSearchParams } from "next/navigation";""",
)

sub(
    """import { TripsSheet } from "@/components/planner/v2/TripsSheet";
import { useLanguage } from "@/context/LanguageContext";
import { usePlanner, type AskAlternativesOptions } from "@/hooks/usePlanner";
import { useSaveTrip } from "@/hooks/useSaveTrip";
import { findCity, usePlannerCities } from "@/hooks/usePlannerCities";
import { useSelectedDay } from "@/hooks/useSelectedDay";
import type { Slot } from "@/types/planner";""",
    """import { TripsSheet } from "@/components/planner/v2/TripsSheet";
import type { OpenTripState } from "@/components/planner/v2/OpenTripNotice";
import { useLanguage } from "@/context/LanguageContext";
import { usePlanner, type AskAlternativesOptions } from "@/hooks/usePlanner";
import { useSaveTrip } from "@/hooks/useSaveTrip";
import { isTripId, useTrip } from "@/hooks/useTrip";
import { findCity, usePlannerCities } from "@/hooks/usePlannerCities";
import { useSelectedDay } from "@/hooks/useSelectedDay";
import { readSavedTripId } from "@/services/plannerDraft";
import { tripToDraft } from "@/services/tripDraft";
import type { Slot } from "@/types/planner";""",
)

sub(
    """ * `?q=<prompt>` (from the landing's `PlannerCard`) is sent as the first turn
 * once, and only when there is no conversation to resume in this tab.
 */""",
    """ * `?q=<prompt>` (from the landing's `PlannerCard`) is sent as the first turn
 * once, and only when there is no conversation to resume in this tab.
 *
 * `?trip=<uuid>` opens a saved trip in it (TRA-196): the trip is loaded,
 * rebuilt into a draft by `services/tripDraft.ts` and handed to
 * `usePlanner.hydrate`, and the query stays in the URL so a reload comes back
 * to the same trip — which is also why "Save trip" puts the new id there. A
 * trip that is not upcoming is read-only: core_api refuses every write on it,
 * so the page hides the ones that would be refused (ADR 0019).
 */""",
)

sub(
    """  const { t } = useLanguage();
  const query = useSearchParams().get("q");""",
    """  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q");
  const tripParam = params.get("trip");""",
)

sub(
    """  const centre = city?.centre ?? null;""",
    """  const centre = city?.centre ?? null;

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
  const readOnly = trip !== null && trip.phase !== "upcoming";""",
)

sub(
    """  const save = useSaveTrip(state, { enabled: !demo, city });""",
    """  const save = useSaveTrip(state, { enabled: !demo, city, openTripId: tripParam });

  // The trip the draft was saved as belongs in the URL: a reload then opens
  // it instead of restoring an untitled draft beside it. The id is already
  // ours, so marking it here keeps the load effect above from hydrating over
  // the very draft that was just written.
  useEffect(() => {
    const saved = save.tripId;
    if (!saved || saved === tripParam) return;
    hydratedRef.current = saved;
    router.replace(`/plan/?trip=${encodeURIComponent(saved)}`);
  }, [router, save.tripId, tripParam]);""",
)

sub(
    """  /** "New trip", from the sheet or after the open trip was deleted. */
  const newTrip = useCallback(() => {
    setShowTrips(false);
    startNew();
  }, [startNew]);""",
    """  /** "New trip", from the sheet or after the open trip was deleted. */
  const newTrip = useCallback(() => {
    setShowTrips(false);
    hydratedRef.current = null;
    startNew();
    router.replace("/plan/");
  }, [router, startNew]);""",
)

sub(
    """  const sentQuery = useRef(false);""",
    """  // What the pane says while the URL's trip is on its way, or never arrives.
  // Once it is in the planner there is nothing to report: the trip itself is
  // what the pane shows.
  const openTrip: OpenTripState | null =
    tripParam === null || tripStatus === "ready"
      ? null
      : tripStatus === "error"
        ? { status: "error", onRetry: reloadTrip }
        : { status: tripStatus };

  const sentQuery = useRef(false);""",
)

sub(
    """          onShowTrips={() => setShowTrips(true)}
          openTripId={save.tripId}""",
    """          onShowTrips={() => setShowTrips(true)}
          openTrip={openTrip}
          openTripId={save.tripId}""",
)

open(p, "w").write(s)
print("ok")
