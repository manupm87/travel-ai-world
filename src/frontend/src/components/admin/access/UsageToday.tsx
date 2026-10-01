"use client";

import { useId, useMemo, useState } from "react";
import { AdminLoadState } from "@/components/admin/AdminStates";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { useAdminUsage } from "@/hooks/admin/useAdminUsage";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { AccessGrant, AdminUsageItem } from "@/services/admin";

export interface UsageTodayProps {
  /** The access list on screen: a row's limit is its email's grant. */
  grants: AccessGrant[];
}

/**
 * How much of a limit (a number above zero) is spent, as a whole percent that
 * agrees with "limit reached": rounded down and at most 99 below the limit
 * (99.96% is not 100%), rounded from the limit on (105%).
 */
export function usagePercent(tokens: number, limit: number): number {
  const percent = (tokens / limit) * 100;
  return tokens >= limit ? Math.round(percent) : Math.min(99, Math.floor(percent));
}

/** How full the bar is, 0–100. */
export function usageShare(tokens: number, limit: number): number {
  return Math.min(100, usagePercent(tokens, limit));
}

/**
 * "Usage today" (TRA-258, ADR 0026): what each account has spent since the
 * last UTC midnight, most tokens first, against its limit. ai_api counts by
 * token subject and knows no email, so the account comes from the users list
 * (the short subject while it is unknown) and the limit from the access list
 * on the same page: the grant's number, "Unlimited" for 0, "Default" when the
 * grant sets none or the email has no grant. Only a numeric limit has a bar.
 */
export function UsageToday({ grants }: UsageTodayProps) {
  const { t } = useLanguage();
  const tu = t.admin.access.usage;
  const f = useFormatters();
  const usage = useAdminUsage();
  const { bySubject } = useAdminUsers();
  const headingId = useId();
  // Whether the admin has asked for a reload: its end is announced, the first
  // load's is not.
  const [asked, setAsked] = useState(false);
  const reloading = usage.status === "ready" && usage.reloading;
  const reload = () => {
    // `aria-disabled`, not `disabled`: the button keeps the focus while it waits.
    if (usage.reloading) return;
    setAsked(true);
    usage.reload();
  };

  const limits = useMemo(
    () => new Map(grants.map((grant) => [grant.email, grant.daily_token_limit])),
    [grants]
  );

  const emailOf = (row: AdminUsageItem) => bySubject.get(row.subject)?.email ?? null;
  const limitOf = (row: AdminUsageItem): number | null => {
    const email = emailOf(row);
    return (email ? limits.get(email.trim().toLowerCase()) : null) ?? null;
  };
  const limitLabel = (row: AdminUsageItem) => {
    const limit = limitOf(row);
    if (limit === null) return t.admin.access.limitDefault;
    if (limit === 0) return t.admin.access.limitUnlimited;
    return f.formatNumber(limit);
  };

  return (
    <section aria-labelledby={headingId} className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg text-text-primary">
            {tu.title}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {usage.status === "ready" ? interpolate(tu.subtitle, { day: usage.usage.day }) : tu.subtitleLoading}
          </p>
        </div>
        {/* The error state below has its own "Try again". */}
        {usage.status !== "error" && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={reload}
            aria-disabled={usage.reloading}
            className={usage.reloading ? "cursor-not-allowed opacity-60" : undefined}
          >
            {reloading ? tu.reloading : tu.reload}
          </Button>
        )}
      </div>
      <p role="status" className="sr-only">
        {asked && usage.status === "ready" && !usage.reloading ? tu.reloaded : ""}
      </p>

      {usage.status !== "ready" ? (
        <AdminLoadState status={usage.status} error={usage.status === "error" ? usage.error : null} onRetry={usage.reload} />
      ) : (
        <DataTable<AdminUsageItem>
          caption={tu.caption}
          empty={tu.empty}
          rows={usage.usage.items}
          rowKey={(row) => row.subject}
          columns={[
            {
              key: "account",
              header: tu.columns.account,
              cell: (row) =>
                emailOf(row) ?? (
                  // The whole subject is in the DOM (copy, screen readers); CSS cuts it.
                  <span className="block max-w-32 truncate font-mono text-xs">{row.subject}</span>
                ),
            },
            { key: "turns", header: tu.columns.turns, numeric: true, cell: (row) => f.formatNumber(row.turns) },
            { key: "tokens", header: tu.columns.tokens, numeric: true, cell: (row) => f.formatNumber(row.tokens) },
            { key: "limit", header: tu.columns.limit, numeric: true, cell: limitLabel },
            {
              key: "share",
              header: tu.columns.share,
              className: "w-40",
              cell: (row) => {
                const limit = limitOf(row);
                if (!limit) return <span className="text-text-secondary">{t.admin.common.none}</span>;
                const share = usageShare(row.tokens, limit);
                const over = row.tokens >= limit;
                return (
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-bg-secondary"
                      >
                        <span
                          data-testid="usage-bar"
                          className={`block h-full rounded-full ${over ? "bg-error" : "bg-accent"}`}
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className={`min-w-12 text-right text-xs tabular-nums ${over ? "text-error" : "text-text-secondary"}`}>
                        {f.formatPercent(usagePercent(row.tokens, limit) / 100, 0)}
                      </span>
                    </span>
                    {over && <span className="text-xs text-error">{tu.over}</span>}
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </section>
  );
}
