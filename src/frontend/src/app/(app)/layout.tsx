import Header from "@/components/layout/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

/**
 * Signed-in pages (dashboard, trip viewer): the app shell and the auth guard,
 * declared once for every route in this group instead of per page.
 *
 * The shell paints no background of its own: `body` already carries
 * `--color-bg-primary`, and a block with its own background here would cover
 * the aurora the dashboard mounts behind itself (TRA-193 moves that decision
 * up into this layout).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col font-sans">
      <Header variant="dashboard" />
      <main className="flex flex-col flex-1 pt-(--header-h)">
        <ProtectedRoute>{children}</ProtectedRoute>
      </main>
    </div>
  );
}
