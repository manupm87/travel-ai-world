/** Layout of the `(admin)` route group: the admin console's shell. */

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { AdminGate } from "@/components/admin/AdminGate";
import Header from "@/components/layout/Header";

/**
 * Shell for the admin console (ADR 0024): header, route guard and admin gate, no aurora.
 * The gate is only UI; the services answer 403 to a non-admin regardless.
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
