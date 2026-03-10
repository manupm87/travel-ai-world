import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/sections/HeroSection";
import PlannerCard from "@/components/sections/PlannerCard";
import HowItWorks from "@/components/sections/HowItWorks";
import FeaturesSection from "@/components/sections/FeaturesSection";
import SocialProof from "@/components/sections/SocialProof";
import FinalCTA from "@/components/sections/FinalCTA";

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
