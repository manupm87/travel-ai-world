/** Layout of the `(app)` route group: the signed-in shell and its route guard. */

import Header from "@/components/layout/Header";
import { AppAurora } from "@/components/layout/AppAurora";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

/**
 * Shell and auth guard for every signed-in route. It paints no background:
 * `body` carries it, and `AppAurora` adds the horizon except on the planner.
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
