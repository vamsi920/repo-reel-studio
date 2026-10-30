import NeoLogo from "#/assets/branding/openhands-logo.svg?react";
import { FOOTER } from "./landing-copy";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--lp-line)] px-4 py-14 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <div className="flex items-center gap-2">
            <NeoLogo width={22} height={22} />
            <span className="text-lg font-semibold">{FOOTER.wordmark}</span>
          </div>
          <p className="mt-3 text-sm text-[var(--lp-ink-3)]">
            {FOOTER.tagline}
          </p>
        </div>
        <div className="flex gap-16">
          {FOOTER.columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-2.5">
              <span className="text-sm font-semibold">{column.title}</span>
              {column.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[var(--lp-ink-2)] hover:text-[var(--lp-primary)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-6xl text-xs text-[var(--lp-ink-3)]">
        {FOOTER.copyright}
      </div>
    </footer>
  );
}
