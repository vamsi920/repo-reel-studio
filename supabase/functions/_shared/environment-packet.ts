import { getConnectorManifest } from "./connector-registry/index.ts";

/**
 * Pure helpers for the admin handoff packet (Environment > Runbook >
 * "Generate packet"). Kept dependency-free of Deno.serve/env so they can be
 * unit tested directly from Node/Vitest, the same way probe-runner.ts is.
 */

export interface EgressHost {
  host: string;
  port: number;
  purposeKey: string;
  mirrorable: boolean;
}

export const PLATFORM_EGRESS: EgressHost[] = [
  { host: "api.github.com", port: 443, purposeKey: "GitHub REST API", mirrorable: false },
  { host: "github.com", port: 443, purposeKey: "GitHub OAuth", mirrorable: false },
  { host: "registry.npmjs.org", port: 443, purposeKey: "npm registry", mirrorable: true },
  { host: "pypi.org", port: 443, purposeKey: "PyPI", mirrorable: true },
  { host: "astral.sh", port: 443, purposeKey: "uv installer", mirrorable: true },
  { host: "ghcr.io", port: 443, purposeKey: "Container images", mirrorable: true },
];

/**
 * connector-registry's per-provider `egress` entries carry `purposeKey` as an
 * i18n translation key (the same "PROBE$..." convention the frontend's
 * I18nKey enum uses), not literal text -- but this Deno edge function has no
 * access to the frontend's i18n runtime or public/locales/*.json. Resolve the
 * known keys to the same English copy the frontend shows elsewhere
 * (public/locales/en/openhands.json) so the handoff packet never renders a
 * raw key to a customer's administrators. PLATFORM_EGRESS entries above are
 * already literal text and simply won't match a key here.
 */
const PROBE_PURPOSE_TEXT: Record<string, string> = {
  "PROBE$EGRESS_GITHUB_API": "GitHub REST API",
  "PROBE$EGRESS_GITHUB_WEB": "GitHub OAuth and repository archives",
  "PROBE$EGRESS_GITLAB": "GitLab API and OAuth",
  "PROBE$EGRESS_BITBUCKET_API": "Bitbucket REST API",
  "PROBE$EGRESS_BITBUCKET_WEB": "Bitbucket OAuth",
  "PROBE$EGRESS_ATLASSIAN_AUTH": "Atlassian OAuth and token refresh",
  "PROBE$EGRESS_ATLASSIAN_API": "Jira REST API",
  "PROBE$EGRESS_LINEAR": "Linear GraphQL API",
  "PROBE$EGRESS_GEMINI": "Google Gemini API",
  "PROBE$EGRESS_OPENAI": "OpenAI API",
  "PROBE$EGRESS_ANTHROPIC": "Anthropic API",
  "PROBE$EGRESS_AZURE_OPENAI": "Azure OpenAI endpoint",
  "PROBE$EGRESS_BEDROCK": "AWS Bedrock endpoint",
  "PROBE$EGRESS_PINECONE": "Pinecone index endpoint",
  "PROBE$EGRESS_S3": "Amazon S3",
  "PROBE$EGRESS_AWS_SECRETS": "AWS Secrets Manager",
  "PROBE$EGRESS_AZURE_BLOB": "Azure Blob Storage",
  "PROBE$EGRESS_POSTHOG": "PostHog analytics ingestion",
  "PROBE$EGRESS_DATADOG": "Datadog intake",
  "PROBE$EGRESS_SLACK": "Slack Web API",
  "PROBE$EGRESS_TEAMS": "Teams incoming webhook",
  "PROBE$EGRESS_OKTA": "Okta directory API",
  "PROBE$EGRESS_ENTRA_LOGIN": "Microsoft identity platform",
  "PROBE$EGRESS_GRAPH": "Microsoft Graph",
  "PROBE$EGRESS_NPM": "npm registry, for agent tooling",
  "PROBE$EGRESS_NODE_DIST": "Node.js downloads, for the desktop build",
  "PROBE$EGRESS_PYPI": "PyPI, for the agent server",
  "PROBE$EGRESS_UV": "uv installer downloads",
  "PROBE$EGRESS_GHCR": "Container images",
  "PROBE$EGRESS_FONTS": "Web fonts",
  "PROBE$EGRESS_OPENHANDS_CLOUD": "OpenHands Cloud backend",
};

export function resolveEgressPurpose(purposeKey: string): string {
  return PROBE_PURPOSE_TEXT[purposeKey] ?? purposeKey;
}

/**
 * Merge platform baseline hosts with connector-contributed hosts, keyed by
 * host:port. Platform entries win on a duplicate host -- they're already
 * readable text, so a connector's raw-key entry for the same host must never
 * silently replace it.
 */
export function mergeEgressHosts(
  providers: { id: string }[],
  platformEgress: EgressHost[] = PLATFORM_EGRESS,
): EgressHost[] {
  const hosts = new Map<string, EgressHost>();
  for (const host of platformEgress) hosts.set(`${host.host}:${host.port}`, host);
  for (const provider of providers) {
    const manifest = getConnectorManifest(provider.id);
    for (const host of manifest?.egress ?? []) {
      const key = `${host.host}:${host.port}`;
      if (!hosts.has(key)) hosts.set(key, host as EgressHost);
    }
  }
  return [...hosts.values()].sort((a, b) => a.host.localeCompare(b.host));
}

export function renderPacket(
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
      `| \`${host.host}\` | ${host.port} | ${resolveEgressPurpose(host.purposeKey)} | ${host.mirrorable ? "yes" : "no"} |`,
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
