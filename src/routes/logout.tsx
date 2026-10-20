import React from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { signOutAndRedirect } from "#/lib/data-platform/auth-flow";

/**
 * `/logout` — one URL that signs the user out and lands on /login.
 *
 * Exists for the desktop app's "Sign Out" menu item (the shell can only
 * navigate; it has no handle on the Supabase client) and as a bookmarkable
 * escape hatch. Also drops the React Query cache so nothing from the
 * previous account survives into the next sign-in on the same device.
 */
export default function Logout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        queryClient.clear();
        await signOutAndRedirect((to, options) => {
          if (!cancelled) navigate(to, options);
        });
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient]);
  return (
    <main
      data-testid="logout-screen"
      className="flex min-h-screen items-center justify-center"
    />
  );
}
