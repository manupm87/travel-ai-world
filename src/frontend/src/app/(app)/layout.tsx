import Header from "@/components/layout/Header";
import { AppAurora } from "@/components/layout/AppAurora";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

/**
 * Signed-in pages (the home, the planner and the route that forwards to it): the shell and the
 * auth guard, declared once for every route in this group instead of per page.
 *
 * The shell paints no background of its own — `body` already carries
 * `--color-bg-primary` — and the dusk horizon behind it comes from
 * `AppAurora`, which mounts the layer for the reading pages and stands aside
 * on the planner (TRA-193).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col font-sans">
      <AppAurora />
      <Header />
      <main className="flex flex-col flex-1 pt-(--header-h)">
        <ProtectedRoute>{children}</ProtectedRoute>
      </main>
    </div>
  );
}
