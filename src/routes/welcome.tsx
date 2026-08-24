import { LandingNav } from "#/components/features/landing/landing-nav";
import { LandingHero } from "#/components/features/landing/landing-hero";
import { LandingProblem } from "#/components/features/landing/landing-problem";
import { LandingFeatures } from "#/components/features/landing/landing-features";
import { LandingTrust } from "#/components/features/landing/landing-trust";
import { LandingHowItWorks } from "#/components/features/landing/landing-how-it-works";
import { LandingCta } from "#/components/features/landing/landing-cta";
import { LandingFooter } from "#/components/features/landing/landing-footer";

/**
 * The marketing/splash page at "/" — fully standalone, no backend/auth
 * required (see the isWelcomePage bypass in src/root.tsx). "Hire Neo"
 * links go to /conversations, the real product console.
 */
export default function Welcome() {
  return (
    <div
      data-testid="welcome-page"
      className="min-h-screen bg-[var(--background-primary)]"
    >
      <LandingNav />
      <main>
        <LandingHero />
        <LandingProblem />
        <LandingFeatures />
        <LandingTrust />
        <LandingHowItWorks />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
