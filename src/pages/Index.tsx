import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import {
  AgenticHero,
  HowItWorksSection,
  TrustSection,
  CtaSection,
} from "@/components/landing/AgenticHero";
import iconUrl from "../../icon.png";

const Footer = () => {
  return (
    <footer className="px-4 py-10 sm:px-6 border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
            <img src={iconUrl} alt="NeoDevEx" className="h-6 w-6" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-foreground">NeoDevEx</div>
            <div className="text-sm text-muted-foreground">Autonomous repo control plane</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
          <Link to="/privacy" className="transition hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="transition hover:text-foreground">
            Terms
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-foreground"
          >
            GitHub
          </a>
        </div>

        <div className="text-sm text-muted-foreground/70">© 2026 NeoDevEx</div>
      </div>
    </footer>
  );
};

const Index = () => {
  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen text-foreground">
      <Navbar />
      <main className="relative overflow-hidden">
        <AgenticHero />
        <HowItWorksSection />
        <TrustSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
