import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/**
 * Public pages: the marketing header (with anchor links) and the footer,
 * declared once for every route in this group.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header variant="landing" />
      <main>{children}</main>
      <Footer />
    </>
  );
}
