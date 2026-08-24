import NeoLogo from "#/assets/branding/openhands-logo.svg?react";
import { FOOTER } from "./landing-copy";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--border-color)] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <NeoLogo width={18} height={18} className="shrink-0" />
          <span className="font-mono text-sm font-semibold">
            {FOOTER.wordmark}
          </span>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">{FOOTER.tagline}</p>
      </div>
    </footer>
  );
}
