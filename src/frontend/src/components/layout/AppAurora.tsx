"use client";

import { usePathname } from "next/navigation";
import { Aurora } from "./Aurora";

/** The one route inside the signed-in shell that brings its own background. */
const PLANNER = "/plan";

/**
 * The aurora for the signed-in shell, minus the planner.
 *
 * The two routes kept for old links are reading surfaces and sit on the same
 * dusk horizon as the landing, so the layer belongs to the layout rather than
 * to each page (TRA-193). The planner is a three-column workspace that fills
 * the viewport and paints its own panes: a drifting sky behind a map and a
 * transcript is weather in the wrong room, and its columns cover it anyway.
 */
export function AppAurora() {
  const pathname = usePathname();
  if (pathname === PLANNER || pathname?.startsWith(`${PLANNER}/`)) return null;
  return <Aurora />;
}
