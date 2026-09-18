"use client";

import { ExternalLink, Plane } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { RouteInfo } from "@/types/planner";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
};

/** One leg when only the outbound date is known, two otherwise. */
export function routeLegs(route: RouteInfo): 1 | 2 {
  return route.outbound_date && !route.return_date ? 1 : 2;
}

/**
 * The legs of the trip: out and (unless the route is one way) back, with a
 * prefilled flight search. Never a price — phase 1 does not quote flights
 * (`t.plan.panel.priceNote`).
 */
export function RouteStrip({ route }: { route: RouteInfo }) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const p = t.plan.panel;

  const legs = [
    { key: "outbound", from: route.origin, to: route.destination, date: route.outbound_date },
    { key: "return", from: route.destination, to: route.origin, date: route.return_date },
  ].slice(0, routeLegs(route));

  return (
    <Card className="flex animate-fade-up flex-col gap-3 p-4">
      <ul className="flex flex-col gap-3">
        {legs.map((leg) => (
          <li key={leg.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Plane size={14} aria-hidden="true" className="shrink-0 text-accent" />
            <span className="text-sm text-text-primary">
              {interpolate(p.route, { from: leg.from, to: leg.to })}
            </span>
            {leg.date && (
              <span className="text-xs text-text-secondary">
                {formatDate(leg.date, DATE_OPTIONS)}
              </span>
            )}
            {route.deep_link && (
              <a
                href={route.deep_link}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {p.searchFlights}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
