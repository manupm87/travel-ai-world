"use client";

import { useLanguage } from "@/context/LanguageContext";
import type { SessionTurnsState } from "@/hooks/admin/useSessionTurns";
import { SESSION_TURNS_LIMIT } from "@/hooks/admin/useSessionTurns";
import { interpolate } from "@/i18n";
import type { AdminUser } from "@/services/admin";
import { AdminLoadState } from "../AdminStates";
import { TurnsTable } from "../turns/TurnsTable";

/** A line of plain text where the table would be. */
function Empty({ children }: { children: string }) {
  return (
    <p
      data-testid="admin-trip-turns-empty"
      className="rounded-xl border border-border-card bg-bg-card p-6 text-center text-sm text-text-secondary"
    >
      {children}
    </p>
  );
}

/**
 * The turns of the planner session that made the trip (TRA-229), oldest
 * first as the API answers them, each row linking to the turn's inspector.
 * A trip saved before sessions were recorded (`sessionId` is `null`) and a
 * session without turns each say so instead of an empty table.
 */
export function TripTurns({
  sessionId,
  state,
  bySubject,
}: {
  sessionId: string | null;
  state: SessionTurnsState;
  bySubject: Map<string, AdminUser>;
}) {
  const { t } = useLanguage();
  const tt = t.admin.trip;
  const count = state.status === "ready" ? state.turns.length : null;

  let body;
  if (!sessionId || state.status === "idle") body = <Empty>{tt.noSession}</Empty>;
  else if (state.status === "loading") body = <AdminLoadState status="loading" />;
  else if (state.status === "error") body = <AdminLoadState status="error" error={state.error} />;
  else if (state.turns.length === 0) body = <Empty>{tt.noTurns}</Empty>;
  else
    body = (
      <>
        <TurnsTable
          turns={state.turns}
          bySubject={bySubject}
          caption={tt.turnsCaption}
          empty={tt.noTurns}
          withDate
        />
        {state.truncated && (
          <p className="mt-2 text-xs text-text-secondary">
            {interpolate(tt.truncated, { count: SESSION_TURNS_LIMIT })}
          </p>
        )}
      </>
    );

  return (
    <section aria-labelledby="admin-trip-turns">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="admin-trip-turns" className="text-lg text-text-primary">
          {tt.turnsTitle}
        </h2>
        {count !== null && (
          <span className="text-sm tabular-nums text-text-secondary">
            {count === 1 ? tt.turnsCountOne : interpolate(tt.turnsCount, { count })}
          </span>
        )}
      </div>
      {body}
    </section>
  );
}
