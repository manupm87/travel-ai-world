import HeroSection from "@/components/landing/HeroSection";
import PlannerCard from "@/components/planner/PlannerCard";
import HowItWorks from "@/components/landing/HowItWorks";
import FeaturesSection from "@/components/landing/FeaturesSection";
import SocialProof from "@/components/landing/SocialProof";
import FinalCTA from "@/components/landing/FinalCTA";

/**
 * Root URL (`/`) Landing Page.
 *
 * Assembles the marketing sections from `src/components/landing`; the header
 * and footer come from the `(marketing)` layout.
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <PlannerCard />
      <HowItWorks />
      <FeaturesSection />
      <SocialProof />
      <FinalCTA />
    </>
  );
}
