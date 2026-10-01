"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { ConfirmRemoveAccess } from "@/components/admin/access/ConfirmRemoveAccess";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { AccessWriteError, useAccessGrants } from "@/hooks/admin/useAccessGrants";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { AccessGrant } from "@/services/admin";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTE_MAX = 200;

const FIELD =
  "w-full rounded-lg border border-border-soft bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
const ROW_BUTTON =
  "rounded px-2 py-1 text-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

type Message = { tone: "ok" | "error"; text: string };

/** `null` for an empty field, the number for a whole one ≥ 0, `"invalid"` for the rest. */
export function parseLimit(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : "invalid";
}

/**
 * The access list (TRA-257, ADR 0026): who may use the app, and each one's
 * daily token limit. One form writes a grant (the same call invites a new
 * email and changes an existing one), the table shows what is stored, "Edit"
 * refills the form from a row and "Remove" asks before it deletes.
 */
export default function AccessClientPage() {
  const { t } = useLanguage();
  const ta = t.admin.access;
  const f = useFormatters();
  const grants = useAccessGrants();
  const none = t.admin.common.none;

  const emailId = useId();
  const limitId = useId();
  const limitHintId = useId();
  const noteId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const limitRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [limit, setLimit] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const fail = (text: string, field?: HTMLInputElement | null) => {
    setMessage({ tone: "error", text });
    field?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) return fail(ta.form.invalidEmail, emailRef.current);
    const parsed = parseLimit(limit);
    if (parsed === "invalid") return fail(ta.form.invalidLimit, limitRef.current);

    setSaving(true);
    setMessage(null);
    try {
      const saved = await grants.save(address, { daily_token_limit: parsed, note: note.trim() || null });
      setEmail("");
      setLimit("");
      setNote("");
      setMessage({ tone: "ok", text: interpolate(ta.form.saved, { email: saved.email }) });
      emailRef.current?.focus();
    } catch (err) {
      const forbidden = err instanceof AccessWriteError && err.reason === "forbidden";
      setMessage({ tone: "error", text: forbidden ? ta.form.forbidden : ta.form.failed });
    } finally {
      setSaving(false);
    }
  };

  const edit = (grant: AccessGrant) => {
    setEmail(grant.email);
    setLimit(grant.daily_token_limit === null ? "" : String(grant.daily_token_limit));
    setNote(grant.note ?? "");
    setMessage(null);
    limitRef.current?.focus();
  };

  const confirmRemove = async () => {
    if (removing === null) return;
    const gone = removing;
    await grants.remove(gone);
    setRemoving(null);
    setMessage({ tone: "ok", text: interpolate(ta.removed, { email: gone }) });
  };

  const limitLabel = (grant: AccessGrant) => {
    if (grant.daily_token_limit === null) return ta.limitDefault;
    if (grant.daily_token_limit === 0) return ta.limitUnlimited;
    return f.formatNumber(grant.daily_token_limit);
  };

  return (
    <div>
      <AdminHeading title={ta.title} subtitle={ta.subtitle} />

      <form
        onSubmit={submit}
        noValidate
        aria-label={ta.form.label}
        className="mb-6 grid gap-4 rounded-xl border border-border-card bg-bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-start"
      >
        <div>
          <label htmlFor={emailId} className="mb-1 block text-xs font-medium text-text-secondary">
            {ta.form.email}
          </label>
          <input
            ref={emailRef}
            id={emailId}
            type="email"
            name="email"
            autoComplete="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={ta.form.emailPlaceholder}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={limitId} className="mb-1 block text-xs font-medium text-text-secondary">
            {ta.form.limit}
          </label>
          <input
            ref={limitRef}
            id={limitId}
            type="text"
            inputMode="numeric"
            name="daily_token_limit"
            autoComplete="off"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            aria-describedby={limitHintId}
            className={FIELD}
          />
          <p id={limitHintId} className="mt-1 text-xs text-text-secondary">
            {ta.form.limitHint}
          </p>
        </div>
        <div>
          <label htmlFor={noteId} className="mb-1 block text-xs font-medium text-text-secondary">
            {ta.form.note}
          </label>
          <input
            id={noteId}
            type="text"
            name="note"
            autoComplete="off"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="lg:pt-5">
          <Button type="submit" size="sm" disabled={saving} aria-busy={saving} className="w-full whitespace-nowrap">
            {saving ? ta.form.saving : ta.form.submit}
          </Button>
        </div>
      </form>

      {/* One live region for both outcomes, so a second message is announced too. */}
      <div aria-live="polite" className="mb-4 min-h-5 text-sm">
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            data-testid="access-message"
            className={message.tone === "error" ? "text-error" : "text-text-secondary"}
          >
            {message.text}
          </p>
        )}
      </div>

      {grants.status !== "ready" ? (
        <AdminLoadState status={grants.status} error={grants.error} onRetry={grants.reload} />
      ) : (
        <DataTable<AccessGrant>
          caption={ta.caption}
          empty={ta.empty}
          rows={grants.items}
          rowKey={(grant) => grant.email}
          columns={[
            { key: "email", header: ta.columns.email, cell: (g) => g.email },
            { key: "limit", header: ta.columns.limit, numeric: true, cell: limitLabel },
            { key: "note", header: ta.columns.note, cell: (g) => g.note || none },
            {
              key: "added",
              header: ta.columns.added,
              className: "whitespace-nowrap",
              cell: (g) => f.formatDate(g.created_at, { month: "short", day: "numeric", year: "numeric" }),
            },
            {
              key: "actions",
              header: ta.columns.actions,
              className: "whitespace-nowrap",
              cell: (g) => (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit(g)}
                    aria-label={interpolate(ta.editLabel, { email: g.email })}
                    className={`${ROW_BUTTON} text-accent`}
                  >
                    {ta.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(g.email)}
                    aria-label={interpolate(ta.removeLabel, { email: g.email })}
                    className={`${ROW_BUTTON} text-error`}
                  >
                    {ta.remove}
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}

      <ConfirmRemoveAccess email={removing} onConfirm={confirmRemove} onCancel={() => setRemoving(null)} />
    </div>
  );
}
