import { Link } from "react-router";
import NeoDevExLogo from "#/assets/branding/openhands-logo.svg?react";
import { NAV } from "./landing-copy";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--background-primary)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-[var(--text-primary)]"
        >
          <NeoDevExLogo width={22} height={22} className="shrink-0" />
          <span className="font-mono text-sm font-semibold tracking-wide">
            {NAV.wordmark}
          </span>
        </Link>
        <Link to="/conversations" className="ame-btn-primary ame-btn-sm">
          {NAV.cta}
        </Link>
      </div>
    </header>
  );
}
