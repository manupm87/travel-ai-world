"use client";

/** One graded answer: the question, the verdict (and the expected one in a judge check), the answer. */

import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { EvalItem } from "@/services/admin";
import { Pill } from "@/components/admin/Pill";

const LOW = 3;

/** Whether an item is worth a second look: not graded, scored under 3, or not as expected. */
export function hasProblem(item: EvalItem): boolean {
  const v = item.verdict;
  if (!v) return true;
  if (Math.min(v.groundedness, v.relevance) < LOW) return true;
  const e = item.expected;
  return (
    e !== null &&
    (e.groundedness !== v.groundedness ||
      e.relevance !== v.relevance ||
      e.acknowledges_gap !== v.acknowledges_gap)
  );
}

function Scores({
  label,
  g,
  r,
  gap,
}: {
  label: string;
  g: number;
  r: number;
  gap: boolean;
}) {
  const { t } = useLanguage();
  const ti = t.admin.judge.item;
  const low = Math.min(g, r) < LOW;
  return (
    <p className="text-xs text-text-secondary">
      <span className="font-medium text-text-primary">{label}</span>{" "}
      <Pill tone={low ? "error" : "success"}>{interpolate(ti.scores, { g, r })}</Pill>{" "}
      <span>{gap ? ti.gapYes : ti.gapNo}</span>
    </p>
  );
}

/** The whole item, as a list entry; the answer and passages fold away under `details`. */
export function EvalItemView({ item }: { item: EvalItem }) {
  const { t } = useLanguage();
  const ti = t.admin.judge.item;
  const v = item.verdict;

  return (
    <article data-item={item.key} className="flex flex-col gap-2 text-sm">
      <p className="text-text-primary">
        <span className="font-mono text-xs text-text-secondary">
          {item.key} ({item.lang})
        </span>{" "}
        “{item.query}”
      </p>
      {!item.answerable && <p className="text-xs text-text-secondary">{ti.unanswerable}</p>}
      {item.defect && (
        <p className="text-xs text-text-secondary">{interpolate(ti.defect, { defect: item.defect })}</p>
      )}
      {item.expected && (
        <Scores
          label={ti.expected}
          g={item.expected.groundedness}
          r={item.expected.relevance}
          gap={item.expected.acknowledges_gap}
        />
      )}
      {v ? (
        <>
          <Scores label={ti.judge} g={v.groundedness} r={v.relevance} gap={v.acknowledges_gap} />
          <p className="text-xs text-text-secondary">{v.reason}</p>
          {v.unsupported_claims.length > 0 && (
            <div className="text-xs">
              <p className="font-medium text-text-primary">{ti.unsupported}</p>
              <ul className="ml-4 list-disc text-text-secondary">
                {v.unsupported_claims.map((claim, n) => (
                  <li key={n}>{claim}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-error">{interpolate(ti.error, { error: item.error ?? "" })}</p>
      )}
      {(item.answer || item.why || item.passages.length > 0) && (
        <details className="text-xs">
          <summary className="cursor-pointer rounded text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {ti.answer}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {item.answer && (
              <p className="whitespace-pre-wrap break-words text-text-primary">{item.answer}</p>
            )}
            {item.why && (
              <p className="text-text-secondary">
                <span className="font-medium text-text-primary">{ti.why}:</span> {item.why}
              </p>
            )}
            {item.passages.length > 0 && (
              <div>
                <p className="font-medium text-text-primary">{ti.passages}</p>
                <ul className="font-mono text-text-secondary">
                  {item.passages.map((id) => (
                    <li key={id} className="break-all">
                      {id}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
