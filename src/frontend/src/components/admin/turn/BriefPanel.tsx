"use client";

import { ListChecks } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { InspectorSection, JsonView } from "./InspectorParts";
import { SECTION_IDS } from "./marks";
import type { TurnContext } from "./types";

/** The trip brief the turn worked from, as JSON, with how many fields were still missing. */
export function BriefPanel({ brief }: { brief: TurnContext["brief"] }) {
  const { t } = useLanguage();
  const tb = t.admin.turn.brief;
  const missing = brief && Array.isArray(brief.missing) ? brief.missing.length : null;
  const hint =
    missing === null ? null : missing === 0 ? tb.complete : interpolate(tb.missing, { count: missing });

  return (
    <InspectorSection id={SECTION_IDS.brief} title={tb.title} icon={ListChecks} aside={hint}>
      {brief ? <JsonView value={brief} /> : <p className="text-sm text-text-secondary">{tb.empty}</p>}
    </InspectorSection>
  );
}
