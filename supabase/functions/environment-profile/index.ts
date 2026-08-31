import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId, requireOrgRole } from "../_shared/org.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";

/**
 * Environment profile operations that need the server: reading the connection
 * set, and rendering the admin handoff packet.
 *
 * Plain profile reads and writes go directly through RLS from the browser --
 * the document holds no credentials. This function exists for the two things
 * the browser genuinely cannot do: enumerate which OAuth applications the
 * deployment has configured, and turn all of that into the document an
 * onboarding engineer hands to the customer's own administrators.
 */

interface EgressHost {
  host: string;
  port: number;
  purposeKey: string;
  mirrorable: boolean;
}

const PLATFORM_EGRESS: EgressHost[] = [
  { host: "api.github.com", port: 443, purposeKey: "GitHub REST API", mirrorable: false },
  { host: "github.com", port: 443, purposeKey: "GitHub OAuth", mirrorable: false },
  { host: "registry.npmjs.org", port: 443, purposeKey: "npm registry", mirrorable: true },
  { host: "pypi.org", port: 443, purposeKey: "PyPI", mirrorable: true },
  { host: "astral.sh", port: 443, purposeKey: "uv installer", mirrorable: true },
  { host: "ghcr.io", port: 443, purposeKey: "Container images", mirrorable: true },
];

function renderPacket(
  appOrigin: string,
  supabaseUrl: string,
  providers: { id: string; capability: string }[],
  hosts: EgressHost[],
): string {
  const callbackUrl = `${supabaseUrl}/functions/v1/connections-oauth-callback`;
  const lines: string[] = [];

  lines.push("# NeoDevEx installation handoff");
  lines.push("");
  lines.push(
    "Everything your administrators need to complete this installation. Nothing here is a secret; the values you create are entered into NeoDevEx directly and are never written down in this document.",
  );
  lines.push("");

  lines.push("## OAuth applications to register");
  lines.push("");
  lines.push(
    `Every OAuth provider below needs an application registered in your own tenant, with this exact redirect URI:`,
  );
  lines.push("");
  lines.push(`    ${callbackUrl}`);
  lines.push("");
  lines.push("| Provider | Scopes | Client ID goes in | Client secret goes in |");
  lines.push("| --- | --- | --- | --- |");

  for (const provider of providers) {
    const manifest = getConnectorManifest(provider.id);
    const oauth = manifest?.oauth as
      | { scopes?: string[]; clientIdEnv?: string; clientSecretEnv?: string }
      | undefined;
    if (!manifest || !oauth) continue;
    lines.push(
      `| ${manifest.id} | \`${(oauth.scopes ?? []).join("`, `")}\` | \`${oauth.clientIdEnv}\` | \`${oauth.clientSecretEnv}\` |`,
    );
  }
  lines.push("");
  lines.push(
    "A self-hosted instance (GitHub Enterprise Server, self-managed GitLab, Bitbucket Data Center) is a separate OAuth issuer and needs its own application, registered on that instance -- the cloud client ID will not work there.",
  );
  lines.push("");

  lines.push("## Firewall rules");
  lines.push("");
  lines.push(
    "Outbound access required from the host running the agent server. Verify these from that host with `npm run preflight`; a check run anywhere else describes a different network.",
  );
  lines.push("");
  lines.push("| Host | Port | Purpose | Internal mirror acceptable |");
  lines.push("| --- | --- | --- | --- |");
  for (const host of hosts) {
    lines.push(
      `| \`${host.host}\` | ${host.port} | ${host.purposeKey} | ${host.mirrorable ? "yes" : "no"} |`,
    );
  }
  lines.push("");

  lines.push("## Inbound access");
  lines.push("");
  lines.push(
    `Issue-triggered automations need webhooks to reach ${supabaseUrl}. If inbound traffic from the internet is not permitted, say so -- NeoDevEx will poll on a schedule instead, and no configuration change is needed on your side.`,
  );
  lines.push("");

  lines.push("## Identity");
  lines.push("");
  lines.push(
    `Sign-in is restricted by email domain. Tell us which domains your staff use, or ask for the restriction to be lifted. The application is served from ${appOrigin}.`,
  );
  lines.push("");

  lines.push("## What we will ask you for");
  lines.push("");
  lines.push(
    "Credentials are entered directly into the NeoDevEx setup screen by whoever holds them. They are encrypted before storage, are never shown back to anyone, and are never included in a document like this one.",
  );
  lines.push("");

  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: { action?: string; doc?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });

  if (payload.action === "get") {
    const { data } = await admin
      .from("environment_profiles")
      .select("doc, revision, updated_at")
      .eq("org_id", orgId)
      .maybeSingle();
    return jsonResponse(data ?? { doc: null });
  }

  if (payload.action === "handoff-packet") {
    if (!(await requireOrgRole(admin, userId, orgId, "member"))) {
      return jsonResponse({ error: "forbidden" }, { status: 403 });
    }

    const { data: connections } = await admin
      .from("connections")
      .select("provider_id, capability")
      .eq("org_id", orgId);

    const providers = (connections ?? []).map((row) => ({
      id: row.provider_id as string,
      capability: row.capability as string,
    }));

    const hosts = new Map<string, EgressHost>();
    for (const host of PLATFORM_EGRESS) hosts.set(`${host.host}:${host.port}`, host);
    for (const provider of providers) {
      const manifest = getConnectorManifest(provider.id);
      for (const host of manifest?.egress ?? []) {
        hosts.set(`${host.host}:${host.port}`, host as EgressHost);
      }
    }
    const hostList = [...hosts.values()].sort((a, b) => a.host.localeCompare(b.host));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://neo.neodevex.com";

    const allowlistCsv = [
      "host,port,purpose,mirrorable",
      ...hostList.map((host) =>
        [
          host.host,
          String(host.port),
          host.purposeKey.replace(/,/g, " "),
          host.mirrorable ? "yes" : "no",
        ].join(","),
      ),
    ].join("\n");

    return jsonResponse({
      markdown: renderPacket(appOrigin, supabaseUrl, providers, hostList),
      allowlistCsv,
    });
  }

  return jsonResponse({ error: "unknown_action" }, { status: 400 });
});
