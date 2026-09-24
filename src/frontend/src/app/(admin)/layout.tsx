import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { AdminGate } from "@/components/admin/AdminGate";
import Header from "@/components/layout/Header";

/**
 * The admin console (`/admin/…`, TRA-222, ADR 0024): the signed-in header,
 * no aurora — a console is read, not admired — then the route guard and the
 * admin gate, declared once for every page of the group. A non-admin gets the
 * "not allowed" card on any URL here; the services answer 403 regardless.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col font-sans bg-bg-primary">
      <Header />
      <main className="flex flex-col flex-1 pt-(--header-h)">
        <ProtectedRoute>
          <AdminGate>{children}</AdminGate>
        </ProtectedRoute>
      </main>
    </div>
  );
}
