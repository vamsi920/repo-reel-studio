/**
 * The vocabulary the Environment module is built on.
 *
 * The unit of onboarding is a *capability* the app needs (somewhere to read
 * source from, somewhere to run embeddings), not a vendor. Vendors are data:
 * a `ConnectorManifest` describes one provider of one capability, and adding
 * a new one is a manifest file plus a logo plus translation keys -- no new
 * table, edge function, or component.
 */

export const CAPABILITIES = [
  "source-control",
  "issue-tracker",
  "llm",
  "vector-store",
  "object-storage",
  "relational-db",
  "secrets",
  "observability",
  "notifications",
  "ci",
  "identity",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type AuthKind =
  | "oauth2-pkce"
  | "oauth2-client-credentials"
  | "api-key"
  | "basic"
  | "bearer-token"
  | "mtls"
  | "aws-sigv4"
  | "service-account-json"
  | "none";

export type FieldKind =
  | "text"
  | "url"
  | "host"
  | "password"
  | "textarea"
  | "select"
  | "number"
  | "boolean"
  | "json"
  | "pem";

/**
 * Field-level validation failures. Codes rather than sentences, mirroring
 * `SetupFieldError` in `src/manifests/manifest-local-validation.ts`, so the
 * message is chosen at render time by i18n and never hardcoded in a manifest.
 */
export type ConnectorFieldError =
  | { code: "required" }
  | { code: "minLength"; length: number }
  | { code: "maxLength"; length: number }
  | { code: "invalidOption" }
  | { code: "pattern"; hintKey: string }
  | { code: "notAHost" }
  | { code: "notHttps" }
  | { code: "invalidJson" }
  | { code: "blockedHost" };

/** How a stored value is summarised for display and for the agent. */
export type RedactionRule = "full" | "last4" | "domain-only";

export interface ConnectorField {
  name: string;
  kind: FieldKind;
  /**
   * `true` means the value is encrypted at rest, never returned by any read
   * path, and never placed in an agent transcript. It is also the flag the
   * edge-side template interpolator uses to refuse putting the value in a URL.
   */
  secret: boolean;
  required: boolean | { whenFieldEquals: [field: string, value: string] };
  labelKey: string;
  helpKey?: string;
  placeholderKey?: string;
  options?: { value: string; labelKey: string }[];
  /** Serialisable so the same rule runs in the browser and in Deno. */
  pattern?: string;
  patternHintKey?: string;
  minLength?: number;
  maxLength?: number;
  defaultValue?: string | number | boolean;
  redact?: RedactionRule;
}

export interface EgressHost {
  /** May carry a single leading `*.` wildcard. */
  host: string;
  port: number;
  purposeKey: string;
  /** Feature ids from the requirement graph; empty means always required. */
  requiredFor?: string[];
  /** Whether an internal mirror is a legitimate substitute in an air gap. */
  mirrorable: boolean;
}

export type ProbeCheckSpec =
  | { id: string; labelKey: string; kind: "status-in"; statuses: number[] }
  | {
      id: string;
      labelKey: string;
      kind: "json-pointer-present";
      pointer: string;
    }
  | {
      id: string;
      labelKey: string;
      kind: "json-pointer-equals";
      pointer: string;
      value: string | number | boolean;
    }
  | { id: string; labelKey: string; kind: "header-present"; header: string };

export type ProbeVantagePreference = "browser" | "edge" | "runtime";

export interface ProbeSpec {
  /** Ordered preference; the first vantage that can run wins. */
  vantage: ProbeVantagePreference[];
  request: {
    method: "GET" | "POST";
    /** Templated with `{{field}}`; secrets are refused in this position. */
    pathTemplate: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
  };
  checks: ProbeCheckSpec[];
  /** Where granted scopes are reported, for downgrade detection. */
  scopeSource?:
    | { from: "header"; name: string; separator: string }
    | { from: "json"; pointer: string; separator?: string };
  /** Where the remote reports its own version, for `minVersion` enforcement. */
  versionSource?:
    | { from: "header"; name: string }
    | { from: "json"; pointer: string };
}

/**
 * A named, whitelisted call the generic proxy is allowed to make on this
 * provider's behalf. The proxy never accepts a caller-supplied URL -- that
 * would turn it into an SSRF engine, which matters especially because
 * self-hosted deployments can point `hostOverride` at an internal address.
 */
export interface ConnectorOperation {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathTemplate: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  /** Parameter names the caller may supply; anything else is rejected. */
  params?: string[];
}

export interface ConnectorOAuth {
  authorizeUrlTemplate: string;
  tokenUrlTemplate: string;
  scopes: string[];
  optionalScopes?: string[];
  usesPkce: boolean;
  refreshable: boolean;
  /**
   * Env var names the *deployment* must set for this provider. Surfaced
   * verbatim in the admin handoff packet; a self-hosted variant needs its own
   * OAuth application and therefore its own pair of names.
   */
  clientIdEnv: string;
  clientSecretEnv: string;
  /**
   * Edge Function that receives the provider's redirect.
   *
   * Defaults to `connections-oauth-callback`. GitHub and Jira must override
   * it: their OAuth applications were registered against the older
   * `github-oauth-callback` / `jira-oauth-callback` URLs, and a provider
   * validates `redirect_uri` against that registration -- a GitHub OAuth App
   * has exactly one callback URL, so pointing the generic flow at a new path
   * would be rejected with `redirect_uri_mismatch` on every attempt. Those
   * legacy functions delegate to the shared completer, so the flow is the
   * same; only the URL differs.
   */
  callbackFunction?: string;
  /** Extra static query parameters, e.g. Atlassian's `audience`. */
  extraAuthorizeParams?: Record<string, string>;
  /** Where the provider reports identity after the token exchange. */
  identity?: { pathTemplate: string; idPointer: string; namePointer: string };
}

export type ConnectorMaturity = "ga" | "beta" | "experimental";

export interface ConnectorManifest {
  id: string;
  capability: Capability;
  nameKey: string;
  descriptionKey: string;
  authKind: AuthKind;
  /**
   * Self-hosted deployments (GHES, GitLab self-managed, Bitbucket DC, Jira DC,
   * self-hosted Qdrant/Weaviate) resolve their base URL from a field instead
   * of a constant.
   */
  hostOverride?: { field: string; baseUrlTemplate: string };
  /** Base URL when `hostOverride` is absent or its field is empty. */
  baseUrl?: string;
  fields: ConnectorField[];
  oauth?: ConnectorOAuth;
  operations?: ConnectorOperation[];
  probe: ProbeSpec;
  egress: EgressHost[];
  /**
   * Where this provider's traffic actually goes.
   *
   * `proxy` (the default) means calls route through `connections-proxy` using
   * the named operations above, so the browser never holds the credential.
   * `direct` means the provider is talked to by a client SDK we do not
   * intermediate -- analytics is the case in point. A `direct` provider is
   * still worth registering: it needs egress, it needs a credential, and it
   * belongs in the readiness report and the firewall allowlist. It simply has
   * no operations for the proxy to expose.
   */
  trafficPath?: "proxy" | "direct";
  docsUrl: string;
  /** File name under `src/lib/environment/logos`. Local asset, never a URL. */
  logo: string;
  minVersion?: string;
  /**
   * Feature id -> i18n key describing what stops working when a scope this
   * manifest requests is not granted. The difference between "connected" and
   * "connected, but pull-request creation will start returning 403".
   */
  degradations?: Record<string, string>;
  /**
   * Regions this provider can legitimately serve. Used to filter the catalog
   * when the environment profile declares a data-residency requirement --
   * a non-compliant provider is unselectable, not merely flagged.
   */
  residency?: ("us" | "eu" | "in" | "global")[];
  maturity: ConnectorMaturity;
}
