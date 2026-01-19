import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProof } from "@/components/landing/SocialProof";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { DemoMockup } from "@/components/landing/DemoMockup";
import { Terminal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Footer = () => (
  <footer className="py-12 border-t border-border">
    <div className="container mx-auto px-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Terminal className="h-4 w-4" />
          </div>
          <span className="font-semibold text-foreground">Repo-to-Reel</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
          <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
        </div>
        <p className="text-sm text-muted-foreground">
          © 2026 Repo-to-Reel. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
);

const CTASection = () => (
  <section id="pricing" className="py-24 relative">
    <div className="absolute inset-0 bg-radial-gradient" />
    <div className="container relative mx-auto px-4 text-center">
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        Ready to transform your <span className="gradient-text">documentation</span>?
      </h2>
      <p className="text-muted-foreground max-w-xl mx-auto mb-8">
        Start creating engaging onboarding videos in minutes. No video editing skills required.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button variant="hero" size="xl" asChild>
          <Link to="/dashboard">Go to Dashboard</Link>
        </Button>
        <Button variant="outline" size="xl" asChild>
          <Link to="/studio">Continue in Studio</Link>
        </Button>
      </div>
    </div>
  </section>
);

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <SocialProof />
        <HowItWorks />
        <DemoMockup />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
