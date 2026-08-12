import { HeroSection } from "@/components/HeroSection";
import { InstallSection } from "@/components/InstallSection";
import { WhySection } from "@/components/WhySection";
import { FaqSection } from "@/components/FaqSection";
import { CtaSection } from "@/components/CtaSection";
import { FooterSection } from "@/components/FooterSection";

export function HomePage() {
  return (
    <main>
      <HeroSection />
      <InstallSection />
      <WhySection />
      <FaqSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
