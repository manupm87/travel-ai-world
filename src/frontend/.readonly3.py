def edit(path, pairs):
    s = open(path).read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f"NOT FOUND in {path}: {old[:100]!r}")
        s = s.replace(old, new, 1)
    open(path, "w").write(s)


edit(
    "src/components/planner/v2/TripPanel.tsx",
    [
        (
            """import { DayStrip } from "./DayStrip";""",
            """import { DayStrip } from "./DayStrip";
import type { LockedPhase } from "./LockedNotice";""",
        ),
        (
            """  openTrip?: OpenTripState | null;""",
            """  openTrip?: OpenTripState | null;
  /**
   * The trip on screen is happening now or is over: it is read, not planned.
   * Every control core_api would refuse goes away — Save, "Start over",
   * "Change", "Remove" and the sheet behind them — and the header says which
   * of the two it is instead of calling it a draft.
   */
  lockedPhase?: LockedPhase | null;""",
        ),
        (
            """  openTrip = null,
  openTripId = null,""",
            """  openTrip = null,
  lockedPhase = null,
  openTripId = null,""",
        ),
        # A locked trip opens no sheet: there is nothing to ask for.
        (
            """  const sheet = (
    <AlternativesSheet""",
            """  const sheet = lockedPhase ? null : (
    <AlternativesSheet""",
        ),
        # The header: what the trip is, then the actions it still has.
        (
            """          <span className="text-xs text-text-secondary">{p.draft}</span>""",
            """          <span className="text-xs text-text-secondary">
            {lockedPhase ? t.plan.trips.phase[lockedPhase] : p.draft}
          </span>""",
        ),
        (
            """          {tripsButton}
          <SaveTripButton
            status={save.status}
            tripId={save.tripId}
            canSave={save.canSave}
            onSave={save.save}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {p.reset}
          </Button>""",
            """          {tripsButton}
          {!lockedPhase && (
            <>
              <SaveTripButton
                status={save.status}
                tripId={save.tripId}
                canSave={save.canSave}
                onSave={save.save}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {p.reset}
              </Button>
            </>
          )}""",
        ),
        (
            """          onSelectStop={currentDay === null ? undefined : onSelectStop}
          onChange={() => setChanging(STAY_SLOT)}""",
            """          onSelectStop={currentDay === null ? undefined : onSelectStop}
          onChange={lockedPhase ? undefined : () => setChanging(STAY_SLOT)}""",
        ),
        (
            """            onBack={() => onSelectStop(null)}
            onChange={(slot) => setChanging(slot)}
            onRemove={(slot, cardId) => {
              onSelectStop(null);
              onRemove(slot, cardId);
            }}""",
            """            onBack={() => onSelectStop(null)}
            onChange={lockedPhase ? undefined : (slot) => setChanging(slot)}
            onRemove={
              lockedPhase
                ? undefined
                : (slot, cardId) => {
                    onSelectStop(null);
                    onRemove(slot, cardId);
                  }
            }""",
        ),
        (
            """            static
            onChange={(slot) => setChanging(slot)}
            onRemove={onRemove}""",
            """            static
            onChange={lockedPhase ? undefined : (slot) => setChanging(slot)}
            onRemove={lockedPhase ? undefined : onRemove}""",
        ),
    ],
)

edit(
    "src/app/(app)/plan/PlannerClientPage.tsx",
    [
        (
            """  // Only an upcoming trip can still be planned; the other two are read.
  const readOnly = trip !== null && trip.phase !== "upcoming";""",
            """  // Only an upcoming trip can still be planned; the other two are read.
  // core_api refuses every write on them, so the page offers none.
  const lockedPhase = trip && trip.phase !== "upcoming" ? trip.phase : null;""",
        ),
        (
            """          onToggleShortlist={onToggleShortlist}
        />
      }
      panel={""",
            """          onToggleShortlist={onToggleShortlist}
          lockedPhase={lockedPhase}
          onNewTrip={newTrip}
        />
      }
      panel={""",
        ),
        (
            """            openTrip={openTrip}""",
            """            openTrip={openTrip}
            lockedPhase={lockedPhase}""",
        ),
    ],
)

print("ok")
