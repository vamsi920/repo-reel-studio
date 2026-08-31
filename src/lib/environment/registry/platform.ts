import type { ConnectorManifest } from "../types/capability";

/**
 * The remaining capabilities: storage, database, secrets, observability,
 * notifications, CI and identity.
 *
 * Several of these describe infrastructure the install already has rather
 * than something to connect for the first time. Recording them still matters:
 * the readiness report, the egress allowlist and the admin handoff packet are
 * all derived from the selected set, so an unrecorded dependency is one the
 * customer's network team never hears about.
 */
export const PLATFORM_MANIFESTS: ConnectorManifest[] = [
  // ---------------------------------------------------------------- storage
  {
    id: "supabase-storage",
    capability: "object-storage",
    nameKey: "CONNECTOR$SUPABASE_STORAGE_NAME",
    descriptionKey: "CONNECTOR$SUPABASE_STORAGE_DESC",
    authKind: "none",
    fields: [],
    probe: {
      vantage: ["browser", "edge"],
      request: { method: "GET", pathTemplate: "/storage/v1/bucket" },
      checks: [
        {
          id: "buckets",
          labelKey: "PROBE$CHECK_BUCKETS",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [],
    docsUrl: "https://supabase.com/docs/guides/storage",
    logo: "supabase.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "ga",
  },
  {
    id: "aws-s3",
    capability: "object-storage",
    nameKey: "CONNECTOR$S3_NAME",
    descriptionKey: "CONNECTOR$S3_DESC",
    authKind: "aws-sigv4",
    hostOverride: {
      field: "endpoint",
      baseUrlTemplate: "https://{{endpoint}}",
    },
    fields: [
      {
        name: "endpoint",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_S3_ENDPOINT",
        helpKey: "CONNECTOR$FIELD_S3_ENDPOINT_HELP",
        defaultValue: "s3.us-east-1.amazonaws.com",
      },
      {
        name: "region",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_AWS_REGION",
        defaultValue: "us-east-1",
      },
      {
        name: "bucket",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_BUCKET",
      },
      {
        name: "accessKeyId",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_AWS_ACCESS_KEY_ID",
      },
      {
        name: "secretAccessKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_AWS_SECRET_ACCESS_KEY",
        redact: "full",
      },
    ],
    operations: [
      {
        id: "put_object",
        method: "PUT",
        pathTemplate: "/{{bucket}}/{{key}}",
        params: ["bucket", "key"],
      },
      {
        id: "get_object",
        method: "GET",
        pathTemplate: "/{{bucket}}/{{key}}",
        params: ["bucket", "key"],
      },
      {
        id: "delete_object",
        method: "DELETE",
        pathTemplate: "/{{bucket}}/{{key}}",
        params: ["bucket", "key"],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/{{bucket}}?max-keys=1" },
      checks: [
        {
          id: "bucket",
          labelKey: "PROBE$CHECK_BUCKET_ACCESS",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [
      {
        host: "*.amazonaws.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_S3",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.aws.amazon.com/AmazonS3/latest/API/",
    logo: "s3.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "beta",
  },
  {
    id: "azure-blob",
    capability: "object-storage",
    nameKey: "CONNECTOR$AZURE_BLOB_NAME",
    descriptionKey: "CONNECTOR$AZURE_BLOB_DESC",
    authKind: "api-key",
    hostOverride: {
      field: "accountHost",
      baseUrlTemplate: "https://{{accountHost}}",
    },
    fields: [
      {
        name: "accountHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_AZURE_ACCOUNT_HOST",
        placeholderKey: "CONNECTOR$FIELD_AZURE_ACCOUNT_HOST_PLACEHOLDER",
      },
      {
        name: "container",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_CONTAINER",
      },
      {
        name: "sasToken",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_SAS_TOKEN",
        helpKey: "CONNECTOR$FIELD_SAS_TOKEN_HELP",
        redact: "full",
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: {
        method: "GET",
        pathTemplate: "/{{container}}?restype=container&comp=list&maxresults=1",
      },
      checks: [
        {
          id: "container",
          labelKey: "PROBE$CHECK_CONTAINER_ACCESS",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [
      {
        host: "*.blob.core.windows.net",
        port: 443,
        purposeKey: "PROBE$EGRESS_AZURE_BLOB",
        mirrorable: false,
      },
    ],
    docsUrl:
      "https://learn.microsoft.com/rest/api/storageservices/blob-service-rest-api",
    logo: "azure.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },

  // --------------------------------------------------------------- database
  {
    id: "supabase-postgres",
    capability: "relational-db",
    nameKey: "CONNECTOR$SUPABASE_PG_NAME",
    descriptionKey: "CONNECTOR$SUPABASE_PG_DESC",
    authKind: "none",
    fields: [],
    probe: {
      vantage: ["browser", "edge"],
      request: {
        method: "POST",
        pathTemplate: "/rest/v1/rpc/environment_installed_extensions",
      },
      checks: [
        {
          id: "reachable",
          labelKey: "PROBE$CHECK_REACHABLE",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [],
    docsUrl: "https://supabase.com/docs/guides/database",
    logo: "supabase.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "ga",
  },
  {
    id: "postgres",
    capability: "relational-db",
    nameKey: "CONNECTOR$POSTGRES_NAME",
    descriptionKey: "CONNECTOR$POSTGRES_DESC",
    authKind: "basic",
    hostOverride: { field: "host", baseUrlTemplate: "postgres://{{host}}" },
    fields: [
      {
        name: "host",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_DB_HOST",
      },
      {
        name: "database",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_DB_NAME",
      },
      {
        name: "username",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_USERNAME",
      },
      {
        name: "password",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_PASSWORD",
        redact: "full",
      },
      {
        name: "sslMode",
        kind: "select",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_SSL_MODE",
        defaultValue: "require",
        options: [
          { value: "require", labelKey: "CONNECTOR$SSL_REQUIRE" },
          { value: "verify-full", labelKey: "CONNECTOR$SSL_VERIFY_FULL" },
          { value: "disable", labelKey: "CONNECTOR$SSL_DISABLE" },
        ],
      },
    ],
    // A raw Postgres connection cannot be probed over HTTP; the runtime
    // preflight opens a real connection instead. Declaring no HTTP probe is
    // honest -- a fake one would report "unknown" forever.
    probe: {
      vantage: ["runtime"],
      request: { method: "GET", pathTemplate: "" },
      checks: [
        {
          id: "connect",
          labelKey: "PROBE$CHECK_DB_CONNECT",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [],
    docsUrl: "https://www.postgresql.org/docs/current/libpq-connect.html",
    logo: "postgres.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },

  // ---------------------------------------------------------------- secrets
  {
    id: "hashicorp-vault",
    capability: "secrets",
    nameKey: "CONNECTOR$VAULT_NAME",
    descriptionKey: "CONNECTOR$VAULT_DESC",
    authKind: "bearer-token",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "https://{{instanceHost}}/v1",
    },
    fields: [
      {
        name: "instanceHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_INSTANCE_HOST",
      },
      {
        name: "mountPath",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_VAULT_MOUNT",
        defaultValue: "secret",
      },
      {
        name: "token",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_VAULT_TOKEN",
        helpKey: "CONNECTOR$FIELD_VAULT_TOKEN_HELP",
        redact: "full",
      },
    ],
    operations: [
      {
        id: "read_secret",
        method: "GET",
        pathTemplate: "/{{mountPath}}/data/{{path}}",
        params: ["mountPath", "path"],
      },
      {
        id: "write_secret",
        method: "POST",
        pathTemplate: "/{{mountPath}}/data/{{path}}",
        params: ["mountPath", "path"],
      },
    ],
    probe: {
      vantage: ["runtime"],
      request: { method: "GET", pathTemplate: "/sys/health" },
      checks: [
        {
          id: "reachable",
          labelKey: "PROBE$CHECK_REACHABLE",
          kind: "status-in",
          statuses: [200, 429],
        },
        {
          id: "unsealed",
          labelKey: "PROBE$CHECK_VAULT_UNSEALED",
          kind: "json-pointer-equals",
          pointer: "/sealed",
          value: false,
        },
      ],
      versionSource: { from: "json", pointer: "/version" },
    },
    egress: [],
    docsUrl: "https://developer.hashicorp.com/vault/api-docs",
    logo: "vault.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },
  {
    id: "aws-secrets-manager",
    capability: "secrets",
    nameKey: "CONNECTOR$AWS_SECRETS_NAME",
    descriptionKey: "CONNECTOR$AWS_SECRETS_DESC",
    authKind: "aws-sigv4",
    hostOverride: {
      field: "region",
      baseUrlTemplate: "https://secretsmanager.{{region}}.amazonaws.com",
    },
    fields: [
      {
        name: "region",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_AWS_REGION",
        defaultValue: "us-east-1",
      },
      {
        name: "accessKeyId",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_AWS_ACCESS_KEY_ID",
      },
      {
        name: "secretAccessKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_AWS_SECRET_ACCESS_KEY",
        redact: "full",
      },
    ],
    probe: {
      vantage: ["runtime"],
      request: {
        method: "POST",
        pathTemplate: "/",
        headers: { "X-Amz-Target": "secretsmanager.ListSecrets" },
        bodyTemplate: '{"MaxResults":1}',
      },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [
      {
        host: "*.amazonaws.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_AWS_SECRETS",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.aws.amazon.com/secretsmanager/latest/apireference/",
    logo: "aws.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },

  // ---------------------------------------------------------- observability
  {
    id: "posthog",
    capability: "observability",
    nameKey: "CONNECTOR$POSTHOG_NAME",
    descriptionKey: "CONNECTOR$POSTHOG_DESC",
    authKind: "api-key",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "https://{{instanceHost}}",
    },
    fields: [
      {
        name: "instanceHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_INSTANCE_HOST",
        defaultValue: "us.i.posthog.com",
      },
      {
        name: "projectApiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_PROJECT_API_KEY",
        redact: "last4",
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/decide?v=3" },
      checks: [
        {
          id: "reachable",
          labelKey: "PROBE$CHECK_REACHABLE",
          kind: "status-in",
          statuses: [200, 401],
        },
      ],
    },
    egress: [
      {
        host: "us.i.posthog.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_POSTHOG",
        mirrorable: false,
        requiredFor: ["telemetry"],
      },
    ],
    // posthog-js posts events straight from the browser, so there is nothing
    // for the proxy to carry -- but the host still has to be allowlisted and
    // the key still has to be right, which is why it is registered at all.
    trafficPath: "direct",
    docsUrl: "https://posthog.com/docs/api",
    logo: "posthog.svg",
    residency: ["us", "eu", "global"],
    maturity: "ga",
  },
  {
    id: "datadog",
    capability: "observability",
    nameKey: "CONNECTOR$DATADOG_NAME",
    descriptionKey: "CONNECTOR$DATADOG_DESC",
    authKind: "api-key",
    hostOverride: { field: "site", baseUrlTemplate: "https://api.{{site}}" },
    fields: [
      {
        name: "site",
        kind: "select",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_DATADOG_SITE",
        defaultValue: "datadoghq.com",
        options: [
          { value: "datadoghq.com", labelKey: "CONNECTOR$DATADOG_SITE_US" },
          { value: "datadoghq.eu", labelKey: "CONNECTOR$DATADOG_SITE_EU" },
          { value: "ap1.datadoghq.com", labelKey: "CONNECTOR$DATADOG_SITE_AP" },
        ],
      },
      {
        name: "apiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_KEY",
        redact: "last4",
      },
      {
        name: "appKey",
        kind: "password",
        secret: true,
        required: false,
        labelKey: "CONNECTOR$FIELD_APP_KEY",
        redact: "last4",
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/api/v1/validate" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "valid",
          labelKey: "PROBE$CHECK_KEY_VALID",
          kind: "json-pointer-equals",
          pointer: "/valid",
          value: true,
        },
      ],
    },
    egress: [
      {
        host: "*.datadoghq.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_DATADOG",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.datadoghq.com/api/latest/",
    logo: "datadog.svg",
    residency: ["us", "eu", "global"],
    maturity: "beta",
  },

  // ---------------------------------------------------------- notifications
  {
    id: "slack",
    capability: "notifications",
    nameKey: "CONNECTOR$SLACK_NAME",
    descriptionKey: "CONNECTOR$SLACK_DESC",
    authKind: "bearer-token",
    baseUrl: "https://slack.com/api",
    fields: [
      {
        name: "botToken",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_SLACK_BOT_TOKEN",
        pattern: "^xoxb-",
        patternHintKey: "CONNECTOR$FIELD_SLACK_TOKEN_PATTERN",
        helpKey: "CONNECTOR$FIELD_SLACK_BOT_TOKEN_HELP",
        redact: "last4",
      },
      {
        name: "defaultChannel",
        kind: "text",
        secret: false,
        required: false,
        labelKey: "CONNECTOR$FIELD_DEFAULT_CHANNEL",
      },
    ],
    operations: [
      {
        id: "post_message",
        method: "POST",
        pathTemplate: "/chat.postMessage",
        params: [],
      },
      {
        id: "list_channels",
        method: "GET",
        pathTemplate: "/conversations.list",
        params: ["limit", "types"],
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/auth.test" },
      checks: [
        {
          id: "reachable",
          labelKey: "PROBE$CHECK_REACHABLE",
          kind: "status-in",
          statuses: [200],
        },
        // Slack answers 200 with {"ok":false} for a bad token, so status
        // alone proves nothing here.
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "json-pointer-equals",
          pointer: "/ok",
          value: true,
        },
      ],
      scopeSource: { from: "header", name: "x-oauth-scopes", separator: "," },
    },
    egress: [
      {
        host: "slack.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_SLACK",
        mirrorable: false,
      },
    ],
    docsUrl: "https://api.slack.com/authentication/token-types",
    logo: "slack.svg",
    residency: ["global"],
    maturity: "beta",
  },
  {
    id: "microsoft-teams",
    capability: "notifications",
    nameKey: "CONNECTOR$TEAMS_NAME",
    descriptionKey: "CONNECTOR$TEAMS_DESC",
    authKind: "api-key",
    hostOverride: {
      field: "webhookHost",
      baseUrlTemplate: "https://{{webhookHost}}",
    },
    fields: [
      {
        name: "webhookHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_TEAMS_WEBHOOK_HOST",
      },
      {
        name: "webhookPath",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_TEAMS_WEBHOOK_PATH",
        helpKey: "CONNECTOR$FIELD_TEAMS_WEBHOOK_PATH_HELP",
        redact: "full",
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/" },
      checks: [
        {
          id: "reachable",
          labelKey: "PROBE$CHECK_REACHABLE",
          kind: "status-in",
          statuses: [200, 400, 405],
        },
      ],
    },
    egress: [
      {
        host: "*.webhook.office.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_TEAMS",
        mirrorable: false,
      },
    ],
    docsUrl:
      "https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook",
    logo: "teams.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },

  // --------------------------------------------------------------------- CI
  {
    id: "github-actions",
    capability: "ci",
    nameKey: "CONNECTOR$GH_ACTIONS_NAME",
    descriptionKey: "CONNECTOR$GH_ACTIONS_DESC",
    // Rides the source-control connection rather than asking for a second
    // credential for the same account.
    authKind: "none",
    baseUrl: "https://api.github.com",
    fields: [],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/user" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
      ],
      scopeSource: { from: "header", name: "x-oauth-scopes", separator: "," },
    },
    egress: [
      {
        host: "api.github.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_GITHUB_API",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.github.com/en/rest/actions",
    logo: "github.svg",
    degradations: {
      "ci.dispatch": "CONNECTOR$GH_ACTIONS_DEGRADE_NO_WORKFLOW_SCOPE",
    },
    residency: ["global"],
    maturity: "beta",
  },
  {
    id: "jenkins",
    capability: "ci",
    nameKey: "CONNECTOR$JENKINS_NAME",
    descriptionKey: "CONNECTOR$JENKINS_DESC",
    authKind: "basic",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "https://{{instanceHost}}",
    },
    fields: [
      {
        name: "instanceHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_INSTANCE_HOST",
      },
      {
        name: "username",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_USERNAME",
      },
      {
        name: "apiToken",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_TOKEN",
        redact: "last4",
      },
    ],
    probe: {
      vantage: ["runtime"],
      request: { method: "GET", pathTemplate: "/api/json?tree=mode" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
      ],
      versionSource: { from: "header", name: "x-jenkins" },
    },
    egress: [],
    docsUrl: "https://www.jenkins.io/doc/book/using/remote-access-api/",
    logo: "jenkins.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },

  // --------------------------------------------------------------- identity
  {
    id: "okta",
    capability: "identity",
    nameKey: "CONNECTOR$OKTA_NAME",
    descriptionKey: "CONNECTOR$OKTA_DESC",
    authKind: "bearer-token",
    hostOverride: {
      field: "orgHost",
      baseUrlTemplate: "https://{{orgHost}}/api/v1",
    },
    fields: [
      {
        name: "orgHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_OKTA_ORG_HOST",
        placeholderKey: "CONNECTOR$FIELD_OKTA_ORG_HOST_PLACEHOLDER",
      },
      {
        name: "apiToken",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_TOKEN",
        helpKey: "CONNECTOR$FIELD_OKTA_TOKEN_HELP",
        redact: "last4",
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/org" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "org",
          labelKey: "PROBE$CHECK_IDENTITY",
          kind: "json-pointer-present",
          pointer: "/id",
        },
      ],
    },
    egress: [
      {
        host: "*.okta.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_OKTA",
        mirrorable: false,
      },
    ],
    docsUrl: "https://developer.okta.com/docs/reference/core-okta-api/",
    logo: "okta.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },
  {
    id: "entra-id",
    capability: "identity",
    nameKey: "CONNECTOR$ENTRA_NAME",
    descriptionKey: "CONNECTOR$ENTRA_DESC",
    authKind: "oauth2-client-credentials",
    baseUrl: "https://graph.microsoft.com/v1.0",
    fields: [
      {
        name: "tenantId",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_TENANT_ID",
      },
      {
        name: "clientId",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_CLIENT_ID",
      },
      {
        name: "clientSecret",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_CLIENT_SECRET",
        redact: "full",
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/organization" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [
      {
        host: "login.microsoftonline.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_ENTRA_LOGIN",
        mirrorable: false,
      },
      {
        host: "graph.microsoft.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_GRAPH",
        mirrorable: false,
      },
    ],
    docsUrl: "https://learn.microsoft.com/graph/auth-v2-service",
    logo: "entra.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },
];
