import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Aurora } from "@/components/layout/Aurora";

/**
 * Public pages: the dusk-horizon background, the header and the footer,
 * declared once for every route in this group.
 *
 * The column is a full viewport tall and `main` takes what the footer leaves,
 * so a page that centres itself (the landing) fills the screen exactly once —
 * no gap under the fold, and nothing to scroll to reach the footer's line.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Aurora />
      <Header variant="landing" />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}
