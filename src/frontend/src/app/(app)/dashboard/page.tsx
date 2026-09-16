import DashboardClientPage from "./DashboardClientPage";

/**
 * Dashboard (`/dashboard`) route: a static shell.
 *
 * Trips are per user, so nothing about them is known at build time; the
 * client page fetches them from core_api with the session token (ADR 0006).
 */
export default function DashboardPage() {
  return <DashboardClientPage />;
}
