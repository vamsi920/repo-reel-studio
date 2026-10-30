import React from "react";
import { Link } from "react-router";
import { motion, useScroll, useSpring } from "framer-motion";
import { LandingConsoleLink } from "./landing-console-link";
import NeoLogo from "#/assets/branding/openhands-logo.svg?react";
import { NAV } from "./landing-copy";

/**
 * Floating glass pill that tightens once the page scrolls, with a reading
 * progress hairline along the top of the viewport.
 */
export function LandingNav() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    restDelta: 0.001,
  });
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(
    () => scrollY.on("change", (y) => setScrolled(y > 24)),
    [scrollY],
  );

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left"
        style={{ scaleX: progress, background: "var(--lp-gradient)" }}
      />
      <header className="fixed inset-x-0 top-3 z-40 flex justify-center px-4">
        <nav
          className={`flex w-full items-center justify-between gap-4 rounded-full border px-3 py-2 transition-all duration-500 ${
            scrolled
              ? "max-w-3xl border-[var(--lp-line)] bg-[rgba(255,255,255,0.75)] shadow-[var(--lp-shadow)] backdrop-blur-xl"
              : "max-w-6xl border-transparent bg-transparent"
          }`}
        >
          <Link
            to="/"
            className="flex items-center gap-2 pl-2 text-[var(--lp-ink)]"
          >
            <NeoLogo width={22} height={22} className="shrink-0" />
            <span className="text-lg font-semibold tracking-tight">
              {NAV.wordmark}
            </span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {NAV.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-1.5 text-sm text-[var(--lp-ink-2)] transition-colors hover:bg-[var(--lp-line)] hover:text-[var(--lp-ink)]"
              >
                {link.label}
              </a>
            ))}
          </div>
          <LandingConsoleLink
            label={NAV.cta}
            className="lp-btn lp-btn-primary px-4 py-2 text-sm"
          />
        </nav>
      </header>
    </>
  );
}
