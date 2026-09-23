"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-aligned, tabular numerals. */
  numeric?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Names the table for assistive technology; visually hidden. */
  caption: string;
  /** What an empty table says instead of rows. */
  empty: string;
  /** Where a row leads: the first cell becomes a link and the whole row clicks through. */
  href?: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * The admin console's one table (TRA-222): dense, a sticky header, numbers
 * right-aligned in tabular numerals, and a wrapper that scrolls in both
 * directions so the page itself never scrolls sideways on a phone.
 *
 * A row with an `href` puts a real link in its first cell — which is what
 * Tab reaches — and clicks through from anywhere else on the row.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  href,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const clickable = Boolean(href || onRowClick);

  const activate = (row: T) => {
    if (onRowClick) onRowClick(row);
    else if (href) router.push(href(row));
  };

  return (
    <div
      className={cn(
        "max-h-[70dvh] overflow-auto rounded-xl border border-border-card bg-bg-card",
        className
      )}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 whitespace-nowrap border-b border-border-card bg-bg-card px-3 py-2 text-xs font-medium text-text-secondary",
                  column.numeric && "text-right"
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-text-secondary">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={clickable ? () => activate(row) : undefined}
                className={cn(
                  "border-b border-border last:border-b-0",
                  clickable && "cursor-pointer hover:bg-bg-surface"
                )}
              >
                {columns.map((column, index) => {
                  const content = column.cell(row);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2 align-middle text-text-primary",
                        column.numeric && "text-right tabular-nums whitespace-nowrap",
                        column.className
                      )}
                    >
                      {index === 0 && href ? (
                        <Link
                          href={href(row)}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded font-medium text-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
