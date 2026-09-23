"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { kindTone, Pill, statusTone } from "@/components/admin/Pill";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { TurnInspector } from "@/components/admin/turn/TurnInspector";
import { useSessionTurns } from "@/hooks/admin/useSessionTurns";
import { useTurn } from "@/hooks/admin/useTurn";
import type { TurnDetail } from "@/services/admin";

/** Hands the whole turn to the browser as `turn-<id>.json`. */
function exportTurn(turn: TurnDetail) {
  const blob = new Blob([JSON.stringify(turn, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `turn-${turn.summary.turn_id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * `/admin/turn/?id=` — the turn inspector (TRA-228): the turn loaded with
 * `useTurn`, its place in the planner session with `useSessionTurns`, and
 * `TurnInspector` for the rest; "Export JSON" hands the whole turn over.
 */
export default function TurnClientPage() {
  const { t } = useLanguage();
  const tt = t.admin.turn;
  const router = useRouter();
  const id = useSearchParams().get("id");
  const state = useTurn(id);
  const turn = state.status === "ready" ? state.turn : null;
  const position = useSessionTurns(turn?.summary.session_id ?? null, turn?.summary.turn_id ?? null);

  const back = (
    <Link
      href="/admin/turns/"
      className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {tt.back}
    </Link>
  );

  if (state.status === "not-found") {
    return (
      <div>
        {back}
        <AdminHeading title={tt.title} />
        <p className="text-text-secondary">{tt.notFound}</p>
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <div>
        {back}
        <AdminLoadState status={state.status} error={state.status === "error" ? state.error : null} />
      </div>
    );
  }

  const s = state.turn.summary;
  return (
    <div>
      {back}
      <div className="mt-3">
        <AdminHeading title={tt.title}>
          <Pill tone={kindTone(s.kind)}>{t.admin.turns.kinds[s.kind]}</Pill>
          <Pill tone={statusTone(s.status)}>{t.admin.turns.statuses[s.status]}</Pill>
          <Button variant="secondary" size="sm" onClick={() => exportTurn(state.turn)}>
            <Download size={14} aria-hidden="true" className="mr-1.5" />
            {tt.export}
          </Button>
        </AdminHeading>
        <p className="-mt-4 mb-6 font-mono text-xs break-all text-text-secondary">{s.turn_id}</p>
      </div>
      <TurnInspector
        turn={state.turn}
        position={position}
        onOpenTurn={(turnId) => router.push(`/admin/turn/?id=${encodeURIComponent(turnId)}`)}
      />
    </div>
  );
}
