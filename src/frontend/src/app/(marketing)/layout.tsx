import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Aurora } from "@/components/layout/Aurora";

/**
 * Public pages: the dusk-horizon background, the header and the footer,
 * declared once for every route in this group.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Aurora />
      <Header variant="landing" />
      <main>{children}</main>
      <Footer />
    </>
  );
}
