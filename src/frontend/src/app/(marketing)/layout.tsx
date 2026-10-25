/** Layout of the `(marketing)` route group: the public pages' shell. */

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Aurora } from "@/components/layout/Aurora";

/**
 * Shell for the public pages: aurora, header and footer.
 * The column is one viewport tall, so a centred page fills the screen with no scroll.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Aurora />
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}
