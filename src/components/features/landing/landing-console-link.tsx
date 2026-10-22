import { Link } from "react-router";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { CONSOLE_CTA } from "./landing-copy";

/**
 * The landing page's primary button. A signed-in user (their Supabase
 * session is persisted in the browser and refreshed automatically) is
 * returning to work, so they get "Console"; everyone else, including
 * anonymous per-browser sessions, gets the "Try Neo" pitch. Both open the
 * product at /conversations.
 */
export function LandingConsoleLink({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  const { status } = useSupabaseSession();
  const signedIn = status === "real";
  return (
    <Link
      to="/conversations"
      className={className}
      data-testid="landing-primary-cta"
    >
      {signedIn ? CONSOLE_CTA : label}
    </Link>
  );
}
