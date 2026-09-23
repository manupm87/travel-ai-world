"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListOrdered, Map as MapIcon, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import type { Translations } from "@/i18n/types";
import { cn } from "@/utils/cn";

type Section = keyof Translations["admin"]["nav"] & ("overview" | "turns" | "trips" | "users");

interface Entry {
  id: Section;
  href: string;
  icon: LucideIcon;
  /** The paths this entry is the active one for (a list and its detail page). */
  matches: string[];
}

const ENTRIES: Entry[] = [
  { id: "overview", href: "/admin/", icon: LayoutDashboard, matches: ["/admin"] },
  { id: "turns", href: "/admin/turns/", icon: ListOrdered, matches: ["/admin/turns", "/admin/turn"] },
  { id: "trips", href: "/admin/trips/", icon: MapIcon, matches: ["/admin/trips", "/admin/trip"] },
  { id: "users", href: "/admin/users/", icon: Users, matches: ["/admin/users"] },
];

/** The entry a path belongs to, trailing slash or not. */
export function activeSection(pathname: string | null): Section {
  const path = (pathname ?? "/admin").replace(/\/+$/, "") || "/";
  return ENTRIES.find((entry) => entry.matches.includes(path))?.id ?? "overview";
}

/**
 * The console's frame: a 240 px sidebar from `lg` up, sticky under the
 * header, and a horizontal tab strip below it on smaller screens. The
 * content area is dense and has no max width.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const active = activeSection(usePathname());

  const link = (entry: Entry, variant: "side" | "tab") => {
    const Icon = entry.icon;
    const current = entry.id === active;
    return (
      <Link
        key={entry.id}
        href={entry.href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 whitespace-nowrap rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          variant === "side" ? "px-3 py-2" : "px-3 py-1.5",
          current
            ? "bg-accent-soft text-text-primary font-medium"
            : "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
        )}
      >
        <Icon size={16} aria-hidden="true" />
        {t.admin.nav[entry.id]}
      </Link>
    );
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] flex-1 flex-col lg:flex-row">
      <nav
        aria-label={t.admin.nav.label}
        className="hidden lg:block w-60 shrink-0 border-r border-border-card"
      >
        <div className="sticky top-(--header-h) flex flex-col gap-1 p-4">
          {ENTRIES.map((entry) => link(entry, "side"))}
        </div>
      </nav>

      <nav
        aria-label={t.admin.nav.label}
        className="lg:hidden overflow-x-auto border-b border-border-card"
      >
        <div className="flex gap-1 px-4 py-2">{ENTRIES.map((entry) => link(entry, "tab"))}</div>
      </nav>

      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</div>
    </div>
  );
}
