import type { ConnectorManifest } from "../types/capability";

export const ISSUE_TRACKER_MANIFESTS: ConnectorManifest[] = [
  {
    id: "jira-cloud",
    capability: "issue-tracker",
    nameKey: "CONNECTOR$JIRA_NAME",
    descriptionKey: "CONNECTOR$JIRA_DESC",
    authKind: "oauth2-pkce",
    baseUrl: "https://api.atlassian.com",
    fields: [],
    oauth: {
      authorizeUrlTemplate: "https://auth.atlassian.com/authorize",
      tokenUrlTemplate: "https://auth.atlassian.com/oauth/token",
      // offline_access is not optional: access tokens last about an hour and
      // the webhook receiver refreshes on every inbound event.
      scopes: ["read:jira-work", "read:jira-user", "offline_access"],
      optionalScopes: ["write:jira-work", "manage:jira-webhook"],
      usesPkce: true,
      refreshable: true,
      callbackFunction: "jira-oauth-callback",
      clientIdEnv: "JIRA_CLIENT_ID",
      clientSecretEnv: "JIRA_CLIENT_SECRET",
      extraAuthorizeParams: {
        audience: "api.atlassian.com",
        prompt: "consent",
      },
      identity: {
        pathTemplate: "/oauth/token/accessible-resources",
        idPointer: "/0/id",
        namePointer: "/0/name",
      },
    },
    operations: [
      {
        id: "list_issues",
        method: "GET",
        pathTemplate: "/ex/jira/{{cloudId}}/rest/api/3/search",
        params: ["cloudId", "jql", "maxResults", "startAt"],
      },
      {
        id: "get_issue",
        method: "GET",
        pathTemplate: "/ex/jira/{{cloudId}}/rest/api/3/issue/{{issueKey}}",
        params: ["cloudId", "issueKey"],
      },
      {
        id: "create_issue",
        method: "POST",
        pathTemplate: "/ex/jira/{{cloudId}}/rest/api/3/issue",
        params: ["cloudId"],
      },
      {
        id: "transition_issue",
        method: "POST",
        pathTemplate:
          "/ex/jira/{{cloudId}}/rest/api/3/issue/{{issueKey}}/transitions",
        params: ["cloudId", "issueKey"],
      },
      {
        id: "register_webhook",
        method: "POST",
        pathTemplate: "/ex/jira/{{cloudId}}/rest/api/3/webhook",
        params: ["cloudId"],
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: {
        method: "GET",
        pathTemplate: "/oauth/token/accessible-resources",
      },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "site",
          labelKey: "PROBE$CHECK_JIRA_SITE",
          kind: "json-pointer-present",
          pointer: "/0/id",
        },
      ],
      scopeSource: { from: "json", pointer: "/0/scopes", separator: " " },
    },
    egress: [
      {
        host: "auth.atlassian.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_ATLASSIAN_AUTH",
        mirrorable: false,
      },
      {
        host: "api.atlassian.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_ATLASSIAN_API",
        mirrorable: false,
      },
    ],
    docsUrl:
      "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/",
    logo: "jira.svg",
    degradations: {
      "automations.jira-trigger": "CONNECTOR$JIRA_DEGRADE_NO_WEBHOOK_SCOPE",
      "issues.create": "CONNECTOR$JIRA_DEGRADE_READ_ONLY",
    },
    residency: ["global"],
    maturity: "ga",
  },
  {
    id: "jira-dc",
    capability: "issue-tracker",
    nameKey: "CONNECTOR$JIRA_DC_NAME",
    descriptionKey: "CONNECTOR$JIRA_DC_DESC",
    authKind: "bearer-token",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "https://{{instanceHost}}/rest/api/2",
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
        name: "accessToken",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_ACCESS_TOKEN",
        helpKey: "CONNECTOR$FIELD_JIRA_DC_TOKEN_HELP",
        redact: "last4",
      },
    ],
    operations: [
      {
        id: "list_issues",
        method: "GET",
        pathTemplate: "/search",
        params: ["jql", "maxResults", "startAt"],
      },
      {
        id: "get_issue",
        method: "GET",
        pathTemplate: "/issue/{{issueKey}}",
        params: ["issueKey"],
      },
      {
        id: "create_issue",
        method: "POST",
        pathTemplate: "/issue",
        params: [],
      },
      {
        id: "transition_issue",
        method: "POST",
        pathTemplate: "/issue/{{issueKey}}/transitions",
        params: ["issueKey"],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/myself" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "identity",
          labelKey: "PROBE$CHECK_IDENTITY",
          kind: "json-pointer-present",
          pointer: "/name",
        },
      ],
    },
    egress: [],
    docsUrl:
      "https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html",
    logo: "jira.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },
  {
    id: "linear",
    capability: "issue-tracker",
    nameKey: "CONNECTOR$LINEAR_NAME",
    descriptionKey: "CONNECTOR$LINEAR_DESC",
    authKind: "api-key",
    baseUrl: "https://api.linear.app",
    fields: [
      {
        name: "apiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_KEY",
        helpKey: "CONNECTOR$FIELD_LINEAR_KEY_HELP",
        pattern: "^lin_api_[A-Za-z0-9]+$",
        patternHintKey: "CONNECTOR$FIELD_LINEAR_KEY_PATTERN",
        redact: "last4",
      },
    ],
    operations: [
      { id: "graphql", method: "POST", pathTemplate: "/graphql", params: [] },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: {
        method: "POST",
        pathTemplate: "/graphql",
        headers: { "Content-Type": "application/json" },
        bodyTemplate: '{"query":"{ viewer { id name } }"}',
      },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "identity",
          labelKey: "PROBE$CHECK_IDENTITY",
          kind: "json-pointer-present",
          pointer: "/data/viewer/id",
        },
      ],
    },
    egress: [
      {
        host: "api.linear.app",
        port: 443,
        purposeKey: "PROBE$EGRESS_LINEAR",
        mirrorable: false,
      },
    ],
    docsUrl:
      "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    logo: "linear.svg",
    residency: ["global"],
    maturity: "beta",
  },
];
