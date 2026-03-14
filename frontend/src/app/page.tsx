import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import PlannerCard from "@/components/ui/PlannerCard";
import HowItWorks from "@/components/landing/HowItWorks";
import FeaturesSection from "@/components/landing/FeaturesSection";
import SocialProof from "@/components/landing/SocialProof";
import FinalCTA from "@/components/landing/FinalCTA";

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
