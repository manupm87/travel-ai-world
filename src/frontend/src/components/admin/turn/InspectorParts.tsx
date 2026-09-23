"use client";

import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { Mark } from "./marks";

/** The small circled numbers of the marks that lead into a section (decorative: the marks themselves are the buttons). */
export function MarkNumbers({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) return null;
  return (
    <span aria-hidden="true" className="inline-flex gap-1">
      {marks.map((mark) => (
        <span
          key={mark.n}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gold/60 text-[11px] font-medium tabular-nums text-text-secondary"
        >
          {mark.n}
        </span>
      ))}
    </span>
  );
}

/**
 * One card of the inspector: a focusable heading (the marks scroll to it and
 * focus it), an optional hint on the right, and its content.
 */
export function InspectorSection({
  id,
  title,
  icon: Icon,
  marks = [],
  aside,
  children,
  className,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  marks?: Mark[];
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("min-w-0 rounded-xl border border-border-card bg-bg-card p-4", className)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3
          id={id}
          tabIndex={-1}
          className="flex scroll-mt-[calc(var(--header-h)+1rem)] items-center gap-2 rounded text-sm font-semibold text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icon size={15} aria-hidden="true" className="shrink-0 text-text-secondary" />
          {title}
          <MarkNumbers marks={marks} />
        </h3>
        {aside && <div className="min-w-0 text-xs text-text-secondary">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

const KEY_LINE = /^(\s*)("(?:[^"\\]|\\.)*")(:\s?)(.*)$/;

/** Pretty JSON in mono, keys in the secondary text colour; scrolls inside itself. */
export function JsonView({
  value,
  text,
  className,
}: {
  value?: unknown;
  text?: string;
  className?: string;
}) {
  const source = text ?? JSON.stringify(value, null, 2) ?? "";
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto rounded-lg border border-border bg-bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text-primary",
        className
      )}
    >
      {source.split("\n").map((line, index) => {
        const match = KEY_LINE.exec(line);
        return (
          <Fragment key={index}>
            {match ? (
              <>
                {match[1]}
                <span className="text-text-secondary">{match[2]}</span>
                {match[3]}
                {match[4]}
              </>
            ) : (
              line
            )}
            {"\n"}
          </Fragment>
        );
      })}
    </pre>
  );
}
