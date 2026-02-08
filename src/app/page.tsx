import {
  Navbar,
  HeroSection,
  FeaturesGrid,
  HowItWorks,
  StatsSection,

} from "@/components/landing";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0e27] relative overflow-hidden">
      <Navbar />
      <HeroSection />
      <FeaturesGrid />
      <HowItWorks />
      <StatsSection />
     
    </main>
  );
}
