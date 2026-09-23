"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { DayStats } from "@/services/admin";
import { cn } from "@/utils/cn";
import {
  fillDays,
  linearScale,
  maxStack,
  niceCeil,
  stackDay,
  ticks,
  type StackKey,
} from "../charts/scale";

/** What each colour means, and the token it is drawn with. */
const FILL: Record<StackKey, string> = {
  ok: "fill-accent",
  errors: "fill-error",
  cancelled: "fill-text-muted",
};
const SWATCH: Record<StackKey | "tokens", string> = {
  ok: "bg-accent",
  errors: "bg-error",
  cancelled: "bg-text-muted",
  tokens: "bg-gold",
};

const MARGIN = { top: 8, right: 12, left: 44 };
const BARS_H = 160;
const AXIS_H = 22;
const GAP = 22;
const LINE_H = 56;
const HEIGHT = MARGIN.top + BARS_H + AXIS_H + GAP + LINE_H + 8;

/** The width of an element, followed as it resizes (720 until it is measured). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Turns per day stacked by status (ok in indigo, errors in red, cancelled in
 * grey), and under it, on its own scale, the output tokens per day as an
 * amber line — two panels sharing the day axis rather than one chart with two
 * y-axes, which reads as a correlation that is not there.
 *
 * Every day is a focusable group: hover or focus shows its tooltip. The SVG
 * is one image to assistive technology, named by `aria-label`, and an
 * `sr-only` table under it carries the same numbers.
 */
export function DailyChart({
  start,
  end,
  days: rawDays,
}: {
  start: string;
  end: string;
  days: DayStats[];
}) {
  const { t } = useLanguage();
  const tc = t.admin.overview.chart;
  const f = useFormatters();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const days = fillDays(start, end, rawDays);
  const empty = days.every((d) => d.turns === 0);

  const plotW = width - MARGIN.left - MARGIN.right;
  const band = days.length > 0 ? plotW / days.length : plotW;
  const barW = Math.max(2, Math.min(28, band * 0.6));
  const x = (i: number) => MARGIN.left + band * i + band / 2;

  const turnsMax = niceCeil(maxStack(days));
  const y = linearScale([0, turnsMax], [MARGIN.top + BARS_H, MARGIN.top]);
  const lineTop = MARGIN.top + BARS_H + AXIS_H + GAP;
  const tokensMax = niceCeil(days.reduce((m, d) => Math.max(m, d.output_tokens), 0));
  const yTokens = linearScale([0, tokensMax], [lineTop + LINE_H, lineTop]);

  const labelEvery = Math.ceil(days.length / Math.max(1, Math.floor(plotW / 56)));
  const shortDay = (day: string) =>
    f.formatDate(`${day}T12:00:00Z`, { month: "short", day: "numeric", timeZone: "UTC" });

  const linePath = days
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yTokens(d.output_tokens).toFixed(1)}`)
    .join(" ");

  const label = interpolate(tc.label, { start: shortDay(start), end: shortDay(end) });
  const activeDay = active !== null ? days[active] : undefined;

  return (
    <div>
      <div ref={ref} className="relative w-full">
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block max-w-full"
        >
          {/* Turns: gridlines and their labels. */}
          {ticks(turnsMax).map((value) => (
            <g key={`t${value}`}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={y(value)}
                dy="0.32em"
                textAnchor="end"
                className="fill-text-secondary text-[11px] tabular-nums"
              >
                {f.formatNumber(value)}
              </text>
            </g>
          ))}

          {/* Output tokens: baseline and the maximum, on their own scale. */}
          <line
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={lineTop + LINE_H}
            y2={lineTop + LINE_H}
            className="stroke-border"
          />
          <text
            x={MARGIN.left - 6}
            y={lineTop}
            dy="0.32em"
            textAnchor="end"
            className="fill-text-secondary text-[11px] tabular-nums"
          >
            {f.formatNumber(tokensMax)}
          </text>
          <text x={MARGIN.left} y={lineTop - 4} className="fill-text-secondary text-[11px]">
            {tc.tokensTitle}
          </text>
          {days.map((d, i) => {
            const cx = x(i);
            const focused = active === i;
            return (
              <g
                key={d.day}
                tabIndex={0}
                data-day={d.day}
                aria-label={shortDay(d.day)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((current) => (current === i ? null : current))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((current) => (current === i ? null : current))}
                className="outline-none group"
              >
                {/* The hit target: the whole column, both panels. */}
                <rect
                  x={cx - band / 2}
                  y={MARGIN.top}
                  width={band}
                  height={lineTop + LINE_H - MARGIN.top}
                  className={cn(
                    "fill-transparent group-focus-visible:stroke-accent",
                    focused && "fill-bg-surface"
                  )}
                  strokeWidth={2}
                  rx={4}
                />
                {stackDay(d).map((segment, index, all) => {
                  const top = y(segment.y1);
                  // A 2 px gap of surface between stacked segments.
                  const bottom = y(segment.y0) - (index > 0 ? 2 : 0);
                  const h = Math.max(0, bottom - top);
                  const isTop = index === all.length - 1;
                  return (
                    <rect
                      key={segment.key}
                      data-segment={segment.key}
                      x={cx - barW / 2}
                      y={top}
                      width={barW}
                      height={h}
                      rx={isTop ? Math.min(4, barW / 2) : 0}
                      className={FILL[segment.key]}
                    />
                  );
                })}
                {!empty && (
                  <circle cx={cx} cy={yTokens(d.output_tokens)} r={focused ? 4 : 2.5} className="fill-gold" />
                )}
                {i % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={MARGIN.top + BARS_H + 15}
                    textAnchor="middle"
                    className="fill-text-secondary text-[11px]"
                  >
                    {shortDay(d.day)}
                  </text>
                )}
              </g>
            );
          })}

          {!empty && (
            <path
              d={linePath}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              className="pointer-events-none stroke-gold"
            />
          )}
        </svg>

        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-sm text-text-secondary">
            {tc.empty}
          </p>
        )}

        {activeDay && active !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-lg border border-border-card bg-bg-card p-3 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(0, x(active) - 88), Math.max(0, width - 176)),
            }}
          >
            <p className="mb-1.5 font-medium text-text-primary">{shortDay(activeDay.day)}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
              <dt className="text-text-secondary">{tc.ok}</dt>
              <dd className="text-right text-text-primary">{f.formatNumber(activeDay.ok)}</dd>
              <dt className="text-text-secondary">{tc.errors}</dt>
              <dd className="text-right text-text-primary">{f.formatNumber(activeDay.errors)}</dd>
              <dt className="text-text-secondary">{tc.cancelled}</dt>
              <dd className="text-right text-text-primary">{f.formatNumber(activeDay.cancelled)}</dd>
              <dt className="text-text-secondary">{tc.tokens}</dt>
              <dd className="text-right text-text-primary">{f.formatNumber(activeDay.output_tokens)}</dd>
              <dt className="text-text-secondary">{tc.p95}</dt>
              <dd className="text-right text-text-primary">
                {activeDay.latency_p95_ms === null ? t.admin.common.none : f.formatMs(activeDay.latency_p95_ms)}
              </dd>
            </dl>
          </div>
        )}
      </div>

      <ul aria-label={tc.legend} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {(["ok", "errors", "cancelled", "tokens"] as const).map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(key === "tokens" ? "h-0.5 w-3" : "h-2.5 w-2.5 rounded-sm", SWATCH[key])}
            />
            {tc[key]}
          </li>
        ))}
      </ul>

      {/* The wrapper, not the table, is `sr-only`: a table never shrinks below its content. */}
      <div className="sr-only">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{tc.day}</th>
            <th scope="col">{tc.ok}</th>
            <th scope="col">{tc.errors}</th>
            <th scope="col">{tc.cancelled}</th>
            <th scope="col">{tc.tokens}</th>
            <th scope="col">{tc.p95}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{shortDay(d.day)}</th>
              <td>{d.ok}</td>
              <td>{d.errors}</td>
              <td>{d.cancelled}</td>
              <td>{d.output_tokens}</td>
              <td>{d.latency_p95_ms === null ? t.admin.common.none : f.formatMs(d.latency_p95_ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
