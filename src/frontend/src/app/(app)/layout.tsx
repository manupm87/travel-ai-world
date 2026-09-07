import Header from "@/components/layout/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

/**
 * Signed-in pages (dashboard, trip viewer): the app shell and the auth guard,
 * declared once for every route in this group instead of per page.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col font-sans">
      <Header variant="dashboard" />
      <main className="flex flex-col flex-1 pt-(--header-h)">
        <ProtectedRoute>{children}</ProtectedRoute>
      </main>
    </div>
  );
}
