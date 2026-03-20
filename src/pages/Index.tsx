import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import iconUrl from "../../icon.png";

const Footer = () => {
  return (
    <footer className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 border-t border-white/6 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05]">
            <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-white">GitFlick</div>
            <div className="text-sm text-white/48">Repo intelligence workspace</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-sm text-white/52">
          <Link to="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <Link to="/terms" className="transition hover:text-white">
            Terms
          </Link>
        </div>

        <div className="text-sm text-white/42">© 2026 GitFlick</div>
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
        <HeroSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
