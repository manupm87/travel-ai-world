"use client";

/** The aurora background for the one signed-in route that has it. */

import { usePathname } from "next/navigation";
import { Aurora } from "./Aurora";

/** The one route inside the signed-in shell that brings its own background. */
const PLANNER = "/plan";

/**
 * The aurora for the signed-in shell, except on the planner, whose
 * full-viewport panes paint their own background and would cover it anyway.
 */
export function AppAurora() {
  const pathname = usePathname();
  if (pathname === PLANNER || pathname?.startsWith(`${PLANNER}/`)) return null;
  return <Aurora />;
}
