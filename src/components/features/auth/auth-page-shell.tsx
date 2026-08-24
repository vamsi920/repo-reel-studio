import { Link } from "react-router";
import NeoLogo from "#/assets/branding/openhands-logo.svg?react";

interface AuthPageShellProps {
  children: React.ReactNode;
}

/**
 * Full-bleed page frame for `/login`, sharing the landing page's palette and
 * radial-glow treatment (`LandingHero`) so the auth flow reads as part of
 * the same product, not a bolted-on generic form.
 */
export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--background-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--primary-bg-subtle),transparent)]"
      />
      <header className="px-6 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[var(--text-primary)]"
        >
          <NeoLogo width={22} height={22} className="shrink-0" />
          {/* eslint-disable-next-line i18next/no-literal-string -- brand wordmark, not translatable copy */}
          <span className="font-mono text-sm font-semibold tracking-wide">
            Neo
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
