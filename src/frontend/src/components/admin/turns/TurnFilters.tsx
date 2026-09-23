"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { displayName } from "@/hooks/admin/useAdminUsers";
import type { AdminUser, TurnKind, TurnStatus } from "@/services/admin";

export interface TurnFilterValues {
  day: string;
  kind: TurnKind | "";
  status: TurnStatus | "";
  subject: string;
  city: string;
}

const KINDS: TurnKind[] = ["planner", "chat", "card"];
const STATUSES: TurnStatus[] = ["ok", "error", "cancelled"];

/** The explorer's filters from the URL; the day defaults to `today` (UTC). */
export function parseTurnFilters(params: URLSearchParams, today: string): TurnFilterValues {
  const kind = params.get("kind") ?? "";
  const status = params.get("status") ?? "";
  return {
    day: /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "") ? (params.get("day") as string) : today,
    kind: (KINDS as string[]).includes(kind) ? (kind as TurnKind) : "",
    status: (STATUSES as string[]).includes(status) ? (status as TurnStatus) : "",
    subject: params.get("subject") ?? "",
    city: params.get("city") ?? "",
  };
}

/** The query string of a set of filters: only what is set, so a shared link stays short. */
export function turnFiltersQuery(values: TurnFilterValues): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}

const FIELD =
  "h-9 rounded-lg border border-border-card bg-bg-card px-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

/**
 * One row of labelled filters: day, kind, status, user and city. Every change
 * but the city's goes straight to the URL; the city is committed on Enter or
 * when the field loses focus, so typing does not ask the API per keystroke.
 */
export function TurnFilters({
  values,
  users,
  onChange,
}: {
  values: TurnFilterValues;
  users: AdminUser[];
  onChange: (next: TurnFilterValues) => void;
}) {
  const { t } = useLanguage();
  const tt = t.admin.turns;
  const [city, setCity] = useState(values.city);
  const [seenCity, setSeenCity] = useState(values.city);
  if (seenCity !== values.city) {
    setSeenCity(values.city);
    setCity(values.city);
  }

  const set = <K extends keyof TurnFilterValues>(key: K, value: TurnFilterValues[K]) =>
    onChange({ ...values, [key]: value });
  const commitCity = () => {
    if (city.trim() !== values.city) set("city", city.trim());
  };

  const withSubject = users
    .filter((user) => user.subject)
    .sort((a, b) => (displayName(a) ?? "").localeCompare(displayName(b) ?? ""));

  const label = "flex flex-col gap-1 text-xs font-medium text-text-secondary";

  return (
    <form
      role="search"
      aria-label={tt.filters}
      onSubmit={(event) => {
        event.preventDefault();
        commitCity();
      }}
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      <label className={label}>
        {tt.day}
        <input
          type="date"
          value={values.day}
          onChange={(event) => event.target.value && set("day", event.target.value)}
          className={FIELD}
        />
      </label>

      <label className={label}>
        {tt.kind}
        <select
          value={values.kind}
          onChange={(event) => set("kind", event.target.value as TurnFilterValues["kind"])}
          className={FIELD}
        >
          <option value="">{tt.all}</option>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {tt.kinds[kind]}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        {tt.status}
        <select
          value={values.status}
          onChange={(event) => set("status", event.target.value as TurnFilterValues["status"])}
          className={FIELD}
        >
          <option value="">{tt.all}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {tt.statuses[status]}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        {tt.user}
        <select
          value={values.subject}
          onChange={(event) => set("subject", event.target.value)}
          className={`${FIELD} max-w-[16rem]`}
        >
          <option value="">{tt.anyone}</option>
          {values.subject && !withSubject.some((user) => user.subject === values.subject) && (
            <option value={values.subject}>{values.subject.slice(0, 8)}</option>
          )}
          {withSubject.map((user) => (
            <option key={user.id} value={user.subject ?? ""}>
              {displayName(user)}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        {tt.city}
        <input
          type="text"
          value={city}
          placeholder={tt.cityPlaceholder}
          onChange={(event) => setCity(event.target.value)}
          onBlur={commitCity}
          className={`${FIELD} w-40`}
        />
      </label>
    </form>
  );
}
