import React from "react";
import { useNavigate } from "react-router";
import { AuthPageShell } from "#/components/features/auth/auth-page-shell";
import { PasswordAuthForm } from "#/components/features/auth/password-auth-form";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { consumePostLoginPath } from "#/lib/teams/invites";

/**
 * Standalone, no backend/onboarding gating (see the `isStandaloneAuthPage`
 * bypass in `root.tsx`) -- a user who isn't signed in yet must always be
 * able to reach this page regardless of agent-server/backend state.
 */
export default function LoginRoute() {
  const navigate = useNavigate();
  const { status } = useSupabaseSession();

  React.useEffect(() => {
    if (status !== "real") return;
    // An invitation link that sent the visitor here takes them back to it.
    navigate(consumePostLoginPath() ?? "/conversations", { replace: true });
  }, [status, navigate]);

  return (
    <AuthPageShell>
      <PasswordAuthForm />
    </AuthPageShell>
  );
}
