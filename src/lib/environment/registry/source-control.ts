import type { ConnectorManifest } from "../types/capability";

/**
 * Self-hosted variants are separate manifests rather than one manifest with a
 * host toggle. They genuinely differ: GHES needs its own OAuth application
 * (its own client id/secret pair), Bitbucket Data Center authenticates with a
 * personal access token rather than Cloud's OAuth, and GitLab self-managed
 * exposes a version-dependent API surface. Folding them together would mean a
 * field set where half the fields are conditionally irrelevant.
 */
export const SOURCE_CONTROL_MANIFESTS: ConnectorManifest[] = [
  {
    id: "github",
    capability: "source-control",
    nameKey: "CONNECTOR$GITHUB_NAME",
    descriptionKey: "CONNECTOR$GITHUB_DESC",
    authKind: "oauth2-pkce",
    baseUrl: "https://api.github.com",
    fields: [],
    oauth: {
      authorizeUrlTemplate: "https://github.com/login/oauth/authorize",
      tokenUrlTemplate: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user"],
      optionalScopes: ["workflow"],
      usesPkce: true,
      refreshable: false,
      clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
      clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
      identity: {
        pathTemplate: "/user",
        idPointer: "/id",
        namePointer: "/login",
      },
    },
    operations: [
      {
        id: "list_repositories",
        method: "GET",
        pathTemplate: "/user/repos",
        params: ["page", "per_page", "sort"],
      },
      {
        id: "search_repositories",
        method: "GET",
        pathTemplate: "/search/repositories",
        params: ["q", "per_page"],
      },
      {
        id: "list_branches",
        method: "GET",
        pathTemplate: "/repos/{{owner}}/{{repo}}/branches",
        params: ["owner", "repo", "per_page"],
      },
      {
        id: "list_pull_requests",
        method: "GET",
        pathTemplate: "/repos/{{owner}}/{{repo}}/pulls",
        params: ["owner", "repo", "state", "per_page"],
      },
    ],
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
        {
          id: "identity",
          labelKey: "PROBE$CHECK_IDENTITY",
          kind: "json-pointer-present",
          pointer: "/login",
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
      {
        host: "github.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_GITHUB_WEB",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.github.com/en/apps/oauth-apps",
    logo: "github.svg",
    degradations: {
      "repositories.clone": "CONNECTOR$GITHUB_DEGRADE_NO_REPO_SCOPE",
      "automations.pull-request": "CONNECTOR$GITHUB_DEGRADE_NO_WORKFLOW_SCOPE",
    },
    residency: ["global"],
    maturity: "ga",
  },
  {
    id: "github-enterprise",
    capability: "source-control",
    nameKey: "CONNECTOR$GHES_NAME",
    descriptionKey: "CONNECTOR$GHES_DESC",
    authKind: "oauth2-pkce",
    hostOverride: {
      field: "enterpriseHost",
      baseUrlTemplate: "https://{{enterpriseHost}}/api/v3",
    },
    fields: [
      {
        name: "enterpriseHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_ENTERPRISE_HOST",
        helpKey: "CONNECTOR$FIELD_ENTERPRISE_HOST_HELP",
        placeholderKey: "CONNECTOR$FIELD_ENTERPRISE_HOST_PLACEHOLDER",
      },
    ],
    oauth: {
      authorizeUrlTemplate: "https://{{enterpriseHost}}/login/oauth/authorize",
      tokenUrlTemplate: "https://{{enterpriseHost}}/login/oauth/access_token",
      scopes: ["repo", "read:user"],
      usesPkce: true,
      refreshable: false,
      // A GHES instance is a different OAuth issuer, so it needs its own
      // application registered on that instance -- the github.com client id
      // is meaningless there.
      clientIdEnv: "GITHUB_ENTERPRISE_OAUTH_CLIENT_ID",
      clientSecretEnv: "GITHUB_ENTERPRISE_OAUTH_CLIENT_SECRET",
      identity: {
        pathTemplate: "/user",
        idPointer: "/id",
        namePointer: "/login",
      },
    },
    operations: [
      {
        id: "list_repositories",
        method: "GET",
        pathTemplate: "/user/repos",
        params: ["page", "per_page", "sort"],
      },
      {
        id: "search_repositories",
        method: "GET",
        pathTemplate: "/search/repositories",
        params: ["q", "per_page"],
      },
      {
        id: "list_branches",
        method: "GET",
        pathTemplate: "/repos/{{owner}}/{{repo}}/branches",
        params: ["owner", "repo", "per_page"],
      },
      {
        id: "list_pull_requests",
        method: "GET",
        pathTemplate: "/repos/{{owner}}/{{repo}}/pulls",
        params: ["owner", "repo", "state", "per_page"],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/user" },
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
          pointer: "/login",
        },
      ],
      scopeSource: { from: "header", name: "x-oauth-scopes", separator: "," },
      versionSource: { from: "header", name: "x-github-enterprise-version" },
    },
    egress: [],
    docsUrl: "https://docs.github.com/en/enterprise-server/admin",
    logo: "github-enterprise.svg",
    minVersion: "3.9",
    residency: ["us", "eu", "in", "global"],
    maturity: "ga",
  },
  {
    id: "gitlab-com",
    capability: "source-control",
    nameKey: "CONNECTOR$GITLAB_NAME",
    descriptionKey: "CONNECTOR$GITLAB_DESC",
    authKind: "oauth2-pkce",
    baseUrl: "https://gitlab.com/api/v4",
    fields: [],
    oauth: {
      authorizeUrlTemplate: "https://gitlab.com/oauth/authorize",
      tokenUrlTemplate: "https://gitlab.com/oauth/token",
      scopes: ["read_api", "read_repository"],
      optionalScopes: ["write_repository", "api"],
      usesPkce: true,
      refreshable: true,
      clientIdEnv: "GITLAB_OAUTH_CLIENT_ID",
      clientSecretEnv: "GITLAB_OAUTH_CLIENT_SECRET",
      identity: {
        pathTemplate: "/user",
        idPointer: "/id",
        namePointer: "/username",
      },
    },
    operations: [
      {
        id: "list_repositories",
        method: "GET",
        pathTemplate: "/projects",
        params: ["membership", "page", "per_page", "order_by"],
      },
      {
        id: "search_repositories",
        method: "GET",
        pathTemplate: "/projects",
        params: ["search", "per_page"],
      },
      {
        id: "list_branches",
        method: "GET",
        pathTemplate: "/projects/{{projectId}}/repository/branches",
        params: ["projectId", "per_page"],
      },
      {
        id: "list_pull_requests",
        method: "GET",
        pathTemplate: "/projects/{{projectId}}/merge_requests",
        params: ["projectId", "state", "per_page"],
      },
    ],
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
        {
          id: "identity",
          labelKey: "PROBE$CHECK_IDENTITY",
          kind: "json-pointer-present",
          pointer: "/username",
        },
      ],
    },
    egress: [
      {
        host: "gitlab.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_GITLAB",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.gitlab.com/ee/api/oauth2.html",
    logo: "gitlab.svg",
    residency: ["global"],
    maturity: "beta",
  },
  {
    id: "gitlab-self-managed",
    capability: "source-control",
    nameKey: "CONNECTOR$GITLAB_SELF_NAME",
    descriptionKey: "CONNECTOR$GITLAB_SELF_DESC",
    authKind: "bearer-token",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "https://{{instanceHost}}/api/v4",
    },
    fields: [
      {
        name: "instanceHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_INSTANCE_HOST",
        helpKey: "CONNECTOR$FIELD_INSTANCE_HOST_HELP",
      },
      {
        name: "accessToken",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_ACCESS_TOKEN",
        helpKey: "CONNECTOR$FIELD_GITLAB_TOKEN_HELP",
        redact: "last4",
      },
    ],
    operations: [
      {
        id: "list_repositories",
        method: "GET",
        pathTemplate: "/projects",
        params: ["membership", "page", "per_page", "order_by"],
      },
      {
        id: "list_branches",
        method: "GET",
        pathTemplate: "/projects/{{projectId}}/repository/branches",
        params: ["projectId", "per_page"],
      },
      {
        id: "list_pull_requests",
        method: "GET",
        pathTemplate: "/projects/{{projectId}}/merge_requests",
        params: ["projectId", "state", "per_page"],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/version" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "version",
          labelKey: "PROBE$CHECK_VERSION",
          kind: "json-pointer-present",
          pointer: "/version",
        },
      ],
      versionSource: { from: "json", pointer: "/version" },
    },
    egress: [],
    docsUrl: "https://docs.gitlab.com/ee/api/rest/",
    logo: "gitlab.svg",
    minVersion: "16.0",
    residency: ["us", "eu", "in", "global"],
    maturity: "beta",
  },
  {
    id: "bitbucket-cloud",
    capability: "source-control",
    nameKey: "CONNECTOR$BITBUCKET_NAME",
    descriptionKey: "CONNECTOR$BITBUCKET_DESC",
    authKind: "oauth2-pkce",
    baseUrl: "https://api.bitbucket.org/2.0",
    fields: [],
    oauth: {
      authorizeUrlTemplate: "https://bitbucket.org/site/oauth2/authorize",
      tokenUrlTemplate: "https://bitbucket.org/site/oauth2/access_token",
      scopes: ["repository", "account"],
      optionalScopes: ["pullrequest"],
      usesPkce: true,
      refreshable: true,
      clientIdEnv: "BITBUCKET_OAUTH_CLIENT_ID",
      clientSecretEnv: "BITBUCKET_OAUTH_CLIENT_SECRET",
      identity: {
        pathTemplate: "/user",
        idPointer: "/uuid",
        namePointer: "/username",
      },
    },
    operations: [
      {
        id: "list_repositories",
        method: "GET",
        pathTemplate: "/repositories/{{workspace}}",
        params: ["workspace", "page", "pagelen"],
      },
      {
        id: "list_branches",
        method: "GET",
        pathTemplate: "/repositories/{{workspace}}/{{repo}}/refs/branches",
        params: ["workspace", "repo", "pagelen"],
      },
      {
        id: "list_pull_requests",
        method: "GET",
        pathTemplate: "/repositories/{{workspace}}/{{repo}}/pullrequests",
        params: ["workspace", "repo", "state", "pagelen"],
      },
    ],
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
        {
          id: "identity",
          labelKey: "PROBE$CHECK_IDENTITY",
          kind: "json-pointer-present",
          pointer: "/username",
        },
      ],
    },
    egress: [
      {
        host: "api.bitbucket.org",
        port: 443,
        purposeKey: "PROBE$EGRESS_BITBUCKET_API",
        mirrorable: false,
      },
      {
        host: "bitbucket.org",
        port: 443,
        purposeKey: "PROBE$EGRESS_BITBUCKET_WEB",
        mirrorable: false,
      },
    ],
    docsUrl: "https://developer.atlassian.com/cloud/bitbucket/oauth-2/",
    logo: "bitbucket.svg",
    residency: ["global"],
    maturity: "beta",
  },
  {
    id: "bitbucket-dc",
    capability: "source-control",
    nameKey: "CONNECTOR$BITBUCKET_DC_NAME",
    descriptionKey: "CONNECTOR$BITBUCKET_DC_DESC",
    authKind: "bearer-token",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "https://{{instanceHost}}/rest/api/1.0",
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
        helpKey: "CONNECTOR$FIELD_BITBUCKET_DC_TOKEN_HELP",
        redact: "last4",
      },
    ],
    operations: [
      {
        id: "list_repositories",
        method: "GET",
        pathTemplate: "/repos",
        params: ["limit", "start"],
      },
      {
        id: "list_branches",
        method: "GET",
        pathTemplate: "/projects/{{project}}/repos/{{repo}}/branches",
        params: ["project", "repo", "limit"],
      },
      {
        id: "list_pull_requests",
        method: "GET",
        pathTemplate: "/projects/{{project}}/repos/{{repo}}/pull-requests",
        params: ["project", "repo", "state", "limit"],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/repos?limit=1" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
      ],
    },
    egress: [],
    docsUrl:
      "https://confluence.atlassian.com/bitbucketserver/personal-access-tokens-939515499.html",
    logo: "bitbucket.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "experimental",
  },
];
