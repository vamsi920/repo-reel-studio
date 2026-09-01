import { corsHeaders } from "../_shared/cors.ts";
import { completeConnectionsOAuth } from "../_shared/connections-oauth-complete.ts";

/**
 * Generic OAuth callback.
 *
 * Kept as its own function for providers that have no legacy callback of
 * their own (GitLab, Bitbucket, Linear, ...). GitHub and Jira cannot use this
 * URL: their OAuth applications are registered against
 * `github-oauth-callback` / `jira-oauth-callback`, and the provider validates
 * `redirect_uri` against that registration -- so for those two the legacy
 * callbacks call `completeConnectionsOAuth` first instead. See
 * `oauth.callbackFunction` in the connector manifests.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const response = await completeConnectionsOAuth(req);
  if (response) return response;

  const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://neo.neodevex.com";
  const url = new URL("/environment/setup", appOrigin);
  url.searchParams.set("error", "invalid_state");
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: url.toString() },
  });
});
