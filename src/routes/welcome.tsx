import { MotionConfig } from "framer-motion";
import { LandingNav } from "#/components/features/landing/landing-nav";
import { LandingHero } from "#/components/features/landing/landing-hero";
import { LandingMarquee } from "#/components/features/landing/landing-marquee";
import { LandingStatement } from "#/components/features/landing/landing-statement";
import { LandingStory } from "#/components/features/landing/landing-story";
import { LandingPlatform } from "#/components/features/landing/landing-platform";
import { LandingStudios } from "#/components/features/landing/landing-studios";
import { LandingTrust } from "#/components/features/landing/landing-trust";
import { LandingStats } from "#/components/features/landing/landing-stats";
import { LandingCta } from "#/components/features/landing/landing-cta";
import { LandingFooter } from "#/components/features/landing/landing-footer";
import "#/components/features/landing/landing.css";

/**
 * The marketing/splash page at "/" — fully standalone, no backend/auth
 * required (see the isWelcomePage bypass in src/root.tsx). "Try Neo"
 * links go to /conversations, the real product console. Always light:
 * `.lp-root` carries its own palette, independent of the app appearance.
 */
export default function Welcome() {
  return (
    <MotionConfig reducedMotion="user">
      <div data-testid="welcome-page" className="lp-root min-h-screen">
        <LandingNav />
        <main>
          <LandingHero />
          <LandingMarquee />
          <LandingStatement />
          <LandingStory />
          <LandingPlatform />
          <LandingStudios />
          <LandingTrust />
          <LandingStats />
          <LandingCta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
