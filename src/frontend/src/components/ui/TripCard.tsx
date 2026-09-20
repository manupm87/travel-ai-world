"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useFormatters } from "@/hooks/useFormatters";
import { cn } from "@/utils/cn";
import type { TripStatus, TripSummary } from "@/types/trip-summary";

interface TripCardProps {
  trip: TripSummary;
  /** Opens the edit sheet. The ⋯ menu only exists when both are given. */
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
  /** The grid's entrance delay; nothing else belongs here. */
  style?: CSSProperties;
}

/** Badge colours per status; the label comes from `t.status`. */
const STATUS_STYLES: Record<TripStatus, string> = {
  planning: "bg-status-planning/20 text-status-planning",
  planned: "bg-accent/20 text-accent",
  finished: "bg-glass-bg text-text-secondary",
};

/** Day and month; the year rides on the end of the range, said once. */
const FROM: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
const TO: Intl.DateTimeFormatOptions = { ...FROM, year: "numeric" };

/**
 * One trip, as a photograph you can open.
 *
 * The cover fills the card and a scrim carries the page's own background back
 * up over it, so the title, the dates and the status read at 4.5:1 on either
 * theme whatever the photo is. The whole card is the link to the viewer — the
 * title's `::after` stretches over it — and the one thing above that link is
 * the ⋯ button: Edit and Delete in a real `role="menu"`, with arrow keys,
 * Escape and the focus handed back. The button is a sibling of the card rather
 * than a child, so the rounded clipping that keeps the photo in its corners
 * cannot cut the open menu off. Hover lifts the whole thing 2 px and lights
 * its edge; the photo never moves, because a trip is not a product tile.
 */
export default function TripCard({ trip, onEdit, onDelete, className, style }: TripCardProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const c = t.dashboard.card;

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useClickOutside(menuRef, () => setOpen(false), open);

  // The first item takes the focus when the menu opens, so the whole thing is
  // reachable with the keyboard alone.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

  const dates =
    trip.startDate && trip.endDate
      ? interpolate(t.dashboard.dateRange, {
          start: formatDate(trip.startDate, FROM),
          end: formatDate(trip.endDate, TO),
        })
      : null;

  const hasMenu = onEdit !== undefined && onDelete !== undefined;

  return (
    <div
      style={style}
      className={cn("group relative transition duration-300 hover:-translate-y-0.5", className)}
    >
      <article className="relative isolate flex h-[248px] flex-col justify-end overflow-hidden rounded-2xl border border-glass-border bg-bg-card transition-[border-color,box-shadow] duration-300 group-hover:border-accent-border group-hover:shadow-field-glow">
        {trip.imageUrl ? (
          <Image
            src={trip.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 400px"
            className="-z-10 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(145deg,var(--color-bg-secondary),var(--color-bg-card)_55%,var(--color-accent-soft))]"
          />
        )}
        {/* The page's own background, brought back up over the photo. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-bg-primary from-30% via-bg-primary/85 via-60% to-bg-primary/15"
        />

        <div className="flex flex-col gap-1.5 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              data-status={trip.status}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm",
                STATUS_STYLES[trip.status]
              )}
            >
              {t.status[trip.status]}
            </span>
            {dates && <span className="text-xs text-text-secondary">{dates}</span>}
          </div>

          <h4 className="text-xl leading-snug font-medium text-text-primary">
            <Link
              href={`/trip/?id=${encodeURIComponent(trip.id)}`}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
            >
              {trip.title}
            </Link>
          </h4>

          {trip.destinations.length > 0 && (
            <p className="text-sm text-text-secondary">{trip.destinations.join(", ")}</p>
          )}
        </div>
      </article>

      {hasMenu && (
        <div ref={menuRef} className="absolute top-3 right-3">
          <button
            ref={buttonRef}
            type="button"
            aria-label={interpolate(c.menu, { title: trip.title })}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={() => setOpen((was) => !was)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              setOpen(true);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-glass-border bg-glass-bg text-text-secondary backdrop-blur-xl transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>

          {open && (
            <div
              id={menuId}
              role="menu"
              aria-label={interpolate(c.menu, { title: trip.title })}
              onKeyDown={onMenuKeyDown}
              className="absolute top-11 right-0 z-10 flex w-44 animate-scale-in flex-col overflow-hidden rounded-xl border border-glass-border bg-bg-card p-1 shadow-field-glow"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none"
              >
                <Pencil size={15} aria-hidden="true" />
                {c.edit}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-error transition hover:bg-error/10 focus-visible:bg-error/10 focus-visible:outline-none"
              >
                <Trash2 size={15} aria-hidden="true" />
                {c.delete}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
