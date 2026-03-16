import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import PlannerCard from "@/components/ui/PlannerCard";
import HowItWorks from "@/components/landing/HowItWorks";
import FeaturesSection from "@/components/landing/FeaturesSection";
import SocialProof from "@/components/landing/SocialProof";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingRedirect from "@/components/landing/LandingRedirect";


/**
 * Root URL (`/`) Landing Page Component.
 * 
 * This Server Component acts as the main entry point to the application.
 * It assembles all the separate UI sections (Hero, Features, SocialProof, etc.)
 * located in `src/components/landing` to construct the marketing landing page.
 * 
 * @returns The composed landing page.
 */
export default function HomePage() {
  return (
    <main>
      <Header />
      <HeroSection />
      <PlannerCard />
      <HowItWorks />
      <FeaturesSection />
      <SocialProof />
      <FinalCTA />
      <Footer />
    </main>
  );
}
