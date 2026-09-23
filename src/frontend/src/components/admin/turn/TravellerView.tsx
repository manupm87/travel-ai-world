"use client";

import { AlertTriangle, Check, CloudSun, Hotel, MapPin, Plane, Trash2, User } from "lucide-react";
import type { ReactNode } from "react";
import { MessageBubble } from "@/components/planner/MessageBubble";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { Mark, MarkHost } from "./marks";
import { hasCards, hasItinerary, type TravellerSummary } from "./traveller";

/** A numbered mark: a button that takes the reader to the section that explains what it sits on. */
function MarkButton({ mark, onActivate }: { mark: Mark; onActivate: (mark: Mark) => void }) {
  const { t } = useLanguage();
  const tm = t.admin.turn.marks;
  return (
    <button
      type="button"
      data-mark={mark.n}
      onClick={() => onActivate(mark)}
      aria-label={interpolate(tm.goTo, { section: tm[mark.section] })}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/70 text-xs font-medium tabular-nums text-text-primary hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      {mark.n}
    </button>
  );
}

/** A block of the traveller's side with its mark (when it has one) in the left gutter. */
function Marked({
  host,
  marks,
  onMark,
  children,
}: {
  host: MarkHost;
  marks: Mark[];
  onMark: (mark: Mark) => void;
  children: ReactNode;
}) {
  const mark = marks.find((m) => m.host === host);
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2">
      <div className="pt-1">{mark && <MarkButton mark={mark} onActivate={onMark} />}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Hotel; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-1">
      <Icon size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-text-secondary" />
      <div className="min-w-0 text-sm">
        <span className="text-text-secondary">{label}: </span>
        <span className="text-text-primary">{children}</span>
      </div>
    </div>
  );
}

/**
 * The left column of the inspector (TRA-228): what the traveller saw — the
 * ask or the choice, the answer, the itinerary and the places the ops drew,
 * the warnings — with the numbered marks that lead to the inspector.
 */
export function TravellerView({
  traveller,
  marks,
  onMark,
}: {
  traveller: TravellerSummary;
  marks: Mark[];
  onMark: (mark: Mark) => void;
}) {
  const { t } = useLanguage();
  const tv = t.admin.turn.traveller;
  const { choice } = traveller;
  const itinerary = hasItinerary(traveller);
  const cards = hasCards(traveller);

  return (
    <section aria-labelledby="turn-traveller" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="turn-traveller" className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <User size={16} aria-hidden="true" className="text-text-secondary" />
          {tv.title}
        </h2>
        <p className="text-xs text-text-secondary">{tv.hint}</p>
      </div>

      <div className="flex flex-col gap-3">
        {traveller.ask && (
          <MessageBubble message={{ role: "user", content: traveller.ask }} />
        )}
        {choice && (
          <div className="flex justify-end">
            <span
              data-choice={choice.kind}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-soft bg-bg-surface px-3 py-1 text-sm text-text-primary"
            >
              {choice.kind === "select" ? (
                <Check size={14} aria-hidden="true" className="shrink-0 text-success" />
              ) : (
                <Trash2 size={14} aria-hidden="true" className="shrink-0 text-text-secondary" />
              )}
              <span className="min-w-0 truncate">
                {choice.kind === "select"
                  ? interpolate(tv.chosen, { group: choice.group })
                  : interpolate(tv.removed, { card: choice.card })}
              </span>
            </span>
          </div>
        )}

        <Marked host="answer" marks={marks} onMark={onMark}>
          {traveller.answer.trim() ? (
            <MessageBubble message={{ role: "assistant", content: traveller.answer }} />
          ) : (
            <p className="text-sm text-text-secondary">{tv.noAnswer}</p>
          )}
        </Marked>

        {itinerary && (
          <Marked host="itinerary" marks={marks} onMark={onMark}>
            <div data-block="itinerary" className="rounded-xl border border-border-card bg-bg-card p-3">
              <h3 className="mb-1 text-sm font-semibold text-text-primary">{tv.itinerary}</h3>
              {traveller.stay && (
                <Row icon={Hotel} label={tv.stay}>
                  {traveller.stay}
                </Row>
              )}
              {traveller.route && (
                <Row icon={Plane} label={tv.route}>
                  {interpolate(tv.routeValue, traveller.route)}
                </Row>
              )}
              {traveller.weather.length > 0 && (
                <Row icon={CloudSun} label={tv.weather}>
                  <span className="flex flex-col">
                    {traveller.weather.map((w) => (
                      <span key={w.day}>
                        {interpolate(tv.day, { day: w.day })}: {w.summary}
                        {w.tMin !== null && w.tMax !== null && (
                          <span className="tabular-nums text-text-secondary">{` ${w.tMin}–${w.tMax} °C`}</span>
                        )}
                      </span>
                    ))}
                  </span>
                </Row>
              )}
            </div>
          </Marked>
        )}

        {cards && (
          <Marked host="cards" marks={marks} onMark={onMark}>
            <div data-block="cards" className="rounded-xl border border-border-card bg-bg-card p-3">
              <h3 className="mb-1 text-sm font-semibold text-text-primary">{tv.places}</h3>
              <ul className="flex flex-col gap-2">
                {traveller.days.map((day) => (
                  <li key={day.day} data-day={day.day} className="min-w-0 text-sm">
                    <p className="text-text-primary">
                      <span className="font-medium">{interpolate(tv.day, { day: day.day })}</span>
                      {day.title && <span className="text-text-secondary">: {day.title}</span>}
                    </p>
                    {day.activities.length > 0 && (
                      <ul className="mt-0.5 flex flex-wrap gap-1">
                        {day.activities.map((title, index) => (
                          <li
                            key={`${title}-${index}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-md bg-bg-surface px-1.5 py-0.5 text-xs text-text-primary"
                          >
                            <MapPin size={11} aria-hidden="true" className="shrink-0 text-text-secondary" />
                            <span className="truncate">{title}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {traveller.options.map((group) => (
                  <li key={group.group} data-options={group.group} className="text-sm text-text-primary">
                    {interpolate(tv.options, { group: group.group })}{" "}
                    <span className="text-text-secondary">
                      ({group.count === 1 ? tv.cardOne : interpolate(tv.cards, { count: group.count })})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Marked>
        )}

        {traveller.warnings.map((warning, index) => {
          const pill = (
            <span
              role="status"
              data-warning={warning.code}
              className="inline-flex max-w-full items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-xs leading-snug text-warning"
            >
              <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="font-mono">{warning.code}</span>
                {warning.message && <span>: {warning.message}</span>}
              </span>
            </span>
          );
          return index === 0 ? (
            <Marked key={index} host="warning" marks={marks} onMark={onMark}>
              {pill}
            </Marked>
          ) : (
            <div key={index} className="pl-8">
              {pill}
            </div>
          );
        })}
      </div>
    </section>
  );
}
