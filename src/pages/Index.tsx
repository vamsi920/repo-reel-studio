import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProof } from "@/components/landing/SocialProof";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { DemoMockup } from "@/components/landing/DemoMockup";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import iconUrl from "../../icon.png";

const Footer = () => {
  const handleComingSoon = (feature: string) => {
    toast({
      title: "Coming Soon",
      description: `${feature} is coming soon!`,
    });
  };

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
            <button 
              onClick={() => handleComingSoon("Privacy Policy")} 
              className="hover:text-foreground transition-colors"
            >
              Privacy
            </button>
            <button 
              onClick={() => handleComingSoon("Terms of Service")} 
              className="hover:text-foreground transition-colors"
            >
              Terms
            </button>
            <button 
              onClick={() => handleComingSoon("Twitter")} 
              className="hover:text-foreground transition-colors"
            >
              Twitter
            </button>
            <button 
              onClick={() => handleComingSoon("GitHub")} 
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </button>
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-primary/20 via-purple-500/20 to-cyan-500/20 rounded-full blur-3xl opacity-30" />
      
      <div className="container relative mx-auto px-4 text-center">
        {/* Hackathon reminder */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 text-sm mb-6">
          <span className="text-yellow-500">🏆</span>
          <span className="text-yellow-200/90 font-medium">Google AI Hackathon 2025 Project</span>
        </div>
        
        <h2 className="text-3xl md:text-5xl font-bold mb-4">
          Ready to transform your{" "}
          <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            codebase
          </span>
          ?
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8 text-lg">
          Experience the future of developer documentation. Let Gemini 3 create stunning video walkthroughs of your code.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {isAuthenticated ? (
            <>
              <Button variant="hero" size="xl" className="gap-2 bg-gradient-to-r from-primary to-purple-500 shadow-lg shadow-primary/25" asChild>
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
              <Button variant="hero" size="xl" className="gap-2 bg-gradient-to-r from-primary to-purple-500 shadow-lg shadow-primary/25" asChild>
                <Link to="/signup">
                  Start Creating Free
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
            <span className="text-green-500">✓</span> Powered by Gemini 3
          </span>
        </div>
      </div>
    </section>
  );
};

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
