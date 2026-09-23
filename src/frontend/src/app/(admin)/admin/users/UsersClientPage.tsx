"use client";

import Link from "next/link";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { DataTable } from "@/components/admin/DataTable";
import { Pill } from "@/components/admin/Pill";
import { CopyButton } from "@/components/admin/users/CopyButton";
import { useLanguage } from "@/context/LanguageContext";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";
import { interpolate } from "@/i18n";
import type { AdminUser } from "@/services/admin";

/**
 * Every account: name, email, role, the token subject the traces carry (the
 * first 8 characters shown, the whole value copied) and a way to that
 * account's turns.
 */
export default function UsersClientPage() {
  const { t } = useLanguage();
  const tu = t.admin.users;
  const users = useAdminUsers();
  const none = t.admin.common.none;

  return (
    <div>
      <AdminHeading title={tu.title} />
      {users.status !== "ready" ? (
        <AdminLoadState status={users.status} error={users.error} onRetry={users.reload} />
      ) : (
        <DataTable<AdminUser>
          caption={tu.caption}
          empty={tu.empty}
          rows={users.items}
          rowKey={(user) => user.id}
          columns={[
            { key: "name", header: tu.columns.name, className: "whitespace-nowrap", cell: (u) => u.name || none },
            { key: "email", header: tu.columns.email, cell: (u) => u.email },
            {
              key: "role",
              header: tu.columns.role,
              cell: (u) => (
                <Pill tone={u.role === "admin" ? "gold" : "muted"}>{tu.roles[u.role]}</Pill>
              ),
            },
            {
              key: "subject",
              header: tu.columns.subject,
              cell: (u) =>
                u.subject ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span data-subject={u.subject} className="font-mono text-xs">
                      {u.subject.slice(0, 8)}
                    </span>
                    <CopyButton value={u.subject} label={interpolate(tu.copySubject, { subject: u.subject })} />
                  </span>
                ) : (
                  none
                ),
            },
            {
              key: "active",
              header: tu.columns.active,
              cell: (u) => (u.is_active ? t.admin.common.yes : t.admin.common.no),
            },
            {
              key: "turns",
              header: tu.columns.turns,
              cell: (u) =>
                u.subject ? (
                  <Link
                    href={`/admin/turns/?subject=${encodeURIComponent(u.subject)}`}
                    className="rounded text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    {tu.viewTurns}
                  </Link>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}
