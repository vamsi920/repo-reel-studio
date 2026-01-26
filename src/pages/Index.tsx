import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProof } from "@/components/landing/SocialProof";
import { ProblemStatement } from "@/components/landing/ProblemStatement";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ImpactMetrics } from "@/components/landing/ImpactMetrics";
import { DemoMockup } from "@/components/landing/DemoMockup";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import iconUrl from "../../icon.png";

const Footer = () => {
  return (
    <footer className="py-12 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <img src={iconUrl} alt="GitFlick" className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <span className="font-semibold text-foreground block">GitFlick</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Repo to Reel
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link
              to="/privacy"
              className="hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="hover:text-foreground transition-colors"
            >
              Terms
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 GitFlick. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

const CTASection = () => {
  const { isAuthenticated } = useAuth();

  return (
    <section id="pricing" className="py-24 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-400/25 via-rose-400/20 to-cyan-400/25 rounded-full blur-3xl opacity-40" />
      
      <div className="container relative mx-auto px-4 text-center">
        {/* Feature Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 via-cyan-500/10 to-rose-500/10 border border-primary/20 text-sm mb-6">
          <span className="text-primary">✨</span>
          <span className="text-foreground font-medium">Next-Gen Developer Tools</span>
        </div>
        
        <h2 className="text-3xl md:text-5xl font-bold mb-4">
          Ready to transform your{" "}
          <span className="bg-gradient-to-r from-primary via-cyan-500 to-rose-500 bg-clip-text text-transparent">
            codebase
          </span>
          ?
        </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8 text-lg">
          Experience the future of developer documentation. AI-powered analysis creates stunning video walkthroughs of your code in seconds.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {isAuthenticated ? (
            <>
              <Button variant="hero" size="xl" className="gap-2 bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/20" asChild>
                <Link to="/dashboard">
                  Go to Dashboard
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <Link to="/studio">Open Studio</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="hero" size="xl" className="gap-2 bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/20" asChild>
                <Link to="/login">
                  Sign In
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <Link to="/login">Sign In</Link>
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="text-green-500">✓</span> 100% Free
          </span>
          <span className="flex items-center gap-1">
            <span className="text-green-500">✓</span> No credit card
          </span>
          <span className="flex items-center gap-1">
            <span className="text-green-500">✓</span> AI-Powered
          </span>
        </div>
      </div>
    </section>
  );
};

const LERP = 0.1;

const Index = () => {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const targetRef = useRef({ x: 0.5, y: 0.5 });

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    targetRef.current = {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    };
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setMousePos((p) => {
        const t = targetRef.current;
        const x = p.x + (t.x - p.x) * LERP;
        const y = p.y + (t.y - p.y) * LERP;
        return { x, y };
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { x, y } = mousePos;
  const xp = x * 100;
  const yp = y * 100;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main
        className="relative overflow-hidden"
        onMouseMove={onMouseMove}
      >
        {/* Multi-color cursor-following glow – cyan, amber, rose, indigo, blue */}
        <div
          className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300"
          style={{
            background: `
              radial-gradient(circle 70vmax at ${xp}% ${yp}%, rgba(34,211,238,0.07) 0%, transparent 50%),
              radial-gradient(circle 55vmax at ${xp}% ${yp}%, rgba(251,146,60,0.06) 0%, transparent 50%),
              radial-gradient(circle 45vmax at ${xp}% ${yp}%, rgba(236,72,153,0.065) 0%, transparent 50%),
              radial-gradient(circle 38vmax at ${xp}% ${yp}%, rgba(99,102,241,0.07) 0%, transparent 50%),
              radial-gradient(circle 50vmax at ${xp}% ${yp}%, rgba(59,130,246,0.055) 0%, transparent 50%)
            `,
          }}
        />
        <HeroSection mousePos={mousePos} />
        <SocialProof />
        <ProblemStatement />
        <HowItWorks />
        <ImpactMetrics />
        <DemoMockup />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
