import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { FeaturedCharactersSection } from "@/components/landing/featured-characters";

export default function Home() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <FeaturedCharactersSection />
    </>
  );
}
