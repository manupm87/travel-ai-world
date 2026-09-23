"use client";

import type { ReactNode } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import type { AdminError } from "@/hooks/admin/adminErrors";

/** A page's heading row: the `h1`, an optional line under it, and its controls on the right. */
export function AdminHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl text-text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

/** Loading, or a failure the reader can retry. */
export function AdminLoadState({
  status,
  error,
  onRetry,
}: {
  status: "loading" | "error";
  error?: AdminError | null;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  if (status === "loading") return <LoadingSpinner label={t.admin.common.loading} />;
  return (
    <div role="alert" className="rounded-xl border border-border-card bg-bg-card p-6 text-center">
      <p className="text-text-primary">
        {error === "forbidden" ? t.admin.common.forbidden : t.admin.common.error}
      </p>
      {onRetry && error !== "forbidden" && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          {t.admin.common.retry}
        </Button>
      )}
    </div>
  );
}

/** "Load more" under a cursor list, while there is a next page. */
export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useLanguage();
  if (!hasMore) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="secondary" size="sm" onClick={onClick} disabled={loading} aria-busy={loading}>
        {loading ? t.admin.common.loadingMore : t.admin.common.loadMore}
      </Button>
    </div>
  );
}
