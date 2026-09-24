"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useFormatters } from "@/hooks/useFormatters";
import { cn } from "@/utils/cn";
import type { TripPhase } from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";

interface TripCardProps {
  trip: TripSummary;
  /** The trip the planner is showing: its card is where you already are. */
  current?: boolean;
  /** The card was followed; a sheet holding the list closes behind it. */
  onOpen?: () => void;
  /** Only an upcoming trip can be renamed; without this there is no menu item. */
  onRename?: () => void;
  onDelete?: () => void;
  className?: string;
  /** The list's entrance delay; nothing else belongs here. */
  style?: CSSProperties;
}

/** Only a trip that is happening or has happened says so; "coming up" is the norm. */
const PILL: Partial<Record<TripPhase, string>> = {
  ongoing: "border-gold/40 bg-gold/15 text-gold",
  past: "border-glass-border bg-glass-bg text-text-primary",
};

/** Day and month; the year rides on the end of the range, said once. */
const FROM: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
const TO: Intl.DateTimeFormatOptions = { ...FROM, year: "numeric" };

/**
 * One trip, as a photograph you can open.
 *
 * The cover fills the card and a scrim carries the page's own background back
 * up over it, so the city, the dates and the title read at 4.5:1 on either
 * theme whatever the photo is. The whole card is the link back into the
 * planner — the title's `::after` stretches over it — and the one thing above
 * that link is the ⋯ button: Rename and Delete in a real `role="menu"`, with
 * arrow keys, Escape and the focus handed back. The button is a sibling of
 * the card rather than a child, so the rounded clipping that keeps the photo
 * in its corners cannot cut the open menu off.
 *
 * A trip that is happening now or is already over wears a pill; one that is
 * still coming up does not, because that is what most of them are, and it
 * cannot be renamed either — core_api refuses the write (ADR 0019).
 */
export default function TripCard({
  trip,
  current = false,
  onOpen,
  onRename,
  onDelete,
  className,
  style,
}: TripCardProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const c = t.plan.trips.card;

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
      ? interpolate(t.plan.trips.dateRange, {
          start: formatDate(trip.startDate, FROM),
          end: formatDate(trip.endDate, TO),
        })
      : null;

  // "12 – 15 Oct 2026. 4 days, 11 stops": the counts only when there are some.
  const counts = [
    trip.days > 0 &&
      (trip.days === 1 ? c.daysOne : interpolate(c.days, { count: trip.days })),
    trip.stops > 0 &&
      (trip.stops === 1 ? c.stopsOne : interpolate(c.stops, { count: trip.stops })),
  ].filter(Boolean);
  const meta = [dates, counts.join(", ")].filter(Boolean).join(". ");
  // The city is said by the title almost always; when it is not, it gets a line.
  const showCity = trip.city && !trip.title.toLowerCase().includes(trip.city.toLowerCase());

  const pill = PILL[trip.phase];
  const hasMenu = onDelete !== undefined;

  return (
    <div style={style} className={cn("group relative", className)}>
      <article
        data-phase={trip.phase}
        className={cn(
          "relative isolate flex h-[132px] flex-col justify-between overflow-hidden rounded-[20px] border bg-bg-card transition-[border-color,box-shadow] duration-300 sm:h-[160px]",
          current ? "border-accent-border shadow-field-glow" : "border-glass-border"
        )}
      >
        {trip.imageUrl ? (
          <Image
            src={trip.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 420px"
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
          className="absolute inset-0 -z-10 bg-gradient-to-t from-bg-primary from-25% via-bg-primary/80 via-60% to-bg-primary/10"
        />

        <div className={cn("flex items-start px-4 pt-4", hasMenu ? "pr-14" : "pr-4")}>
          {!trip.imageUrl && <ImageIcon size={18} aria-hidden="true" className="text-text-muted" />}
          {pill && (
            <span
              className={cn(
                "ml-auto rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm",
                pill
              )}
            >
              {t.plan.trips.phase[trip.phase]}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 px-4 pb-4">
          <h4 className="font-heading text-[22px] leading-tight font-normal tracking-[-0.02em] text-text-primary sm:text-2xl">
            <Link
              href={`/plan/?trip=${encodeURIComponent(trip.id)}`}
              aria-current={current ? "page" : undefined}
              onClick={onOpen}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
            >
              {trip.title}
            </Link>
          </h4>

          {showCity && <p className="text-sm text-text-secondary">{trip.city}</p>}
          {meta && <p className="text-[13px] text-text-secondary">{meta}</p>}
        </div>
      </article>

      {hasMenu && (
        <div ref={menuRef} className="absolute top-2.5 right-2.5">
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
              className="absolute top-11 right-0 z-10 flex w-48 animate-scale-in flex-col overflow-hidden rounded-xl border border-glass-border bg-bg-card p-1 shadow-field-glow"
            >
              {onRename && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onRename();
                  }}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none"
                >
                  <Pencil size={15} aria-hidden="true" />
                  {c.rename}
                </button>
              )}
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
