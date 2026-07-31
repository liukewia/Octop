import { HeroSection } from "@/components/HeroSection";
import { StatsSection } from "@/components/StatsSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { TechGrid } from "@/components/TechGrid";
import { TerminalSection } from "@/components/TerminalSection";
import { ChannelsSection } from "@/components/ChannelsSection";
import { FooterSection } from "@/components/FooterSection";

export function HomePage() {
  return (
    <main>
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <TechGrid />
      <TerminalSection />
      <ChannelsSection />
      <FooterSection />
    </main>
  );
}
