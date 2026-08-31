import type { ConnectorManifest } from "../types/capability";

/**
 * The model providers the agent-server can be pointed at. Models themselves
 * still come from the agent-server's LLM metadata endpoints
 * (`src/api/option-service/option-service.api.ts`); this registry records
 * *which* provider an install has chosen and verifies its credential, so the
 * readiness report can say "no usable LLM" instead of leaving the user to
 * discover it when their first conversation fails.
 */
export const LLM_MANIFESTS: ConnectorManifest[] = [
  {
    id: "google-gemini",
    capability: "llm",
    nameKey: "CONNECTOR$GEMINI_NAME",
    descriptionKey: "CONNECTOR$GEMINI_DESC",
    authKind: "api-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    fields: [
      {
        name: "apiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_KEY",
        redact: "last4",
      },
      {
        name: "model",
        kind: "text",
        secret: false,
        required: false,
        labelKey: "CONNECTOR$FIELD_MODEL",
        defaultValue: "gemini-pro-latest",
      },
    ],
    operations: [
      { id: "list_models", method: "GET", pathTemplate: "/models", params: [] },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/models" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "models",
          labelKey: "PROBE$CHECK_MODELS",
          kind: "json-pointer-present",
          pointer: "/models",
        },
      ],
    },
    egress: [
      {
        host: "generativelanguage.googleapis.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_GEMINI",
        mirrorable: false,
      },
    ],
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    logo: "gemini.svg",
    residency: ["global"],
    maturity: "ga",
  },
  {
    id: "openai",
    capability: "llm",
    nameKey: "CONNECTOR$OPENAI_NAME",
    descriptionKey: "CONNECTOR$OPENAI_DESC",
    authKind: "api-key",
    baseUrl: "https://api.openai.com/v1",
    fields: [
      {
        name: "apiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_KEY",
        pattern: "^sk-",
        patternHintKey: "CONNECTOR$FIELD_OPENAI_KEY_PATTERN",
        redact: "last4",
      },
      {
        name: "organization",
        kind: "text",
        secret: false,
        required: false,
        labelKey: "CONNECTOR$FIELD_ORGANIZATION",
      },
    ],
    operations: [
      { id: "list_models", method: "GET", pathTemplate: "/models", params: [] },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: { method: "GET", pathTemplate: "/models" },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "models",
          labelKey: "PROBE$CHECK_MODELS",
          kind: "json-pointer-present",
          pointer: "/data",
        },
      ],
    },
    egress: [
      {
        host: "api.openai.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_OPENAI",
        mirrorable: false,
      },
    ],
    docsUrl: "https://platform.openai.com/docs/api-reference",
    logo: "openai.svg",
    residency: ["global"],
    maturity: "ga",
  },
  {
    id: "anthropic",
    capability: "llm",
    nameKey: "CONNECTOR$ANTHROPIC_NAME",
    descriptionKey: "CONNECTOR$ANTHROPIC_DESC",
    authKind: "api-key",
    baseUrl: "https://api.anthropic.com/v1",
    fields: [
      {
        name: "apiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_KEY",
        pattern: "^sk-ant-",
        patternHintKey: "CONNECTOR$FIELD_ANTHROPIC_KEY_PATTERN",
        redact: "last4",
      },
    ],
    operations: [
      { id: "list_models", method: "GET", pathTemplate: "/models", params: [] },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: {
        method: "GET",
        pathTemplate: "/models",
        headers: { "anthropic-version": "2023-06-01" },
      },
      checks: [
        {
          id: "auth",
          labelKey: "PROBE$CHECK_AUTH",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "models",
          labelKey: "PROBE$CHECK_MODELS",
          kind: "json-pointer-present",
          pointer: "/data",
        },
      ],
    },
    egress: [
      {
        host: "api.anthropic.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_ANTHROPIC",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.claude.com/en/api",
    logo: "anthropic.svg",
    residency: ["global"],
    maturity: "ga",
  },
  {
    id: "azure-openai",
    capability: "llm",
    nameKey: "CONNECTOR$AZURE_OPENAI_NAME",
    descriptionKey: "CONNECTOR$AZURE_OPENAI_DESC",
    authKind: "api-key",
    hostOverride: {
      field: "resourceHost",
      baseUrlTemplate: "https://{{resourceHost}}/openai",
    },
    fields: [
      {
        name: "resourceHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_AZURE_RESOURCE_HOST",
        placeholderKey: "CONNECTOR$FIELD_AZURE_RESOURCE_HOST_PLACEHOLDER",
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
        name: "apiVersion",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_VERSION",
        defaultValue: "2024-10-21",
      },
      {
        name: "deployment",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_DEPLOYMENT",
      },
    ],
    operations: [
      {
        id: "list_deployments",
        method: "GET",
        pathTemplate: "/deployments",
        params: [],
      },
    ],
    probe: {
      vantage: ["edge", "runtime"],
      request: {
        method: "GET",
        pathTemplate: "/deployments?api-version={{apiVersion}}",
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
        host: "*.openai.azure.com",
        port: 443,
        purposeKey: "PROBE$EGRESS_AZURE_OPENAI",
        mirrorable: false,
      },
    ],
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/reference",
    logo: "azure.svg",
    // Deployed into a customer-chosen Azure region, so it satisfies a
    // residency requirement that api.openai.com cannot.
    residency: ["us", "eu", "in", "global"],
    maturity: "beta",
  },
  {
    id: "aws-bedrock",
    capability: "llm",
    nameKey: "CONNECTOR$BEDROCK_NAME",
    descriptionKey: "CONNECTOR$BEDROCK_DESC",
    authKind: "aws-sigv4",
    hostOverride: {
      field: "region",
      baseUrlTemplate: "https://bedrock.{{region}}.amazonaws.com",
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
      {
        name: "sessionToken",
        kind: "password",
        secret: true,
        required: false,
        labelKey: "CONNECTOR$FIELD_AWS_SESSION_TOKEN",
        redact: "full",
      },
    ],
    operations: [
      {
        id: "list_models",
        method: "GET",
        pathTemplate: "/foundation-models",
        params: [],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/foundation-models" },
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
        purposeKey: "PROBE$EGRESS_BEDROCK",
        mirrorable: false,
      },
    ],
    docsUrl: "https://docs.aws.amazon.com/bedrock/latest/APIReference/",
    logo: "bedrock.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "beta",
  },
  {
    id: "ollama",
    capability: "llm",
    nameKey: "CONNECTOR$OLLAMA_NAME",
    descriptionKey: "CONNECTOR$OLLAMA_DESC",
    // The only LLM provider that satisfies an air-gapped install: the model
    // runs inside the customer's network, so no external egress is required.
    authKind: "none",
    hostOverride: {
      field: "instanceHost",
      baseUrlTemplate: "http://{{instanceHost}}",
    },
    fields: [
      {
        name: "instanceHost",
        kind: "host",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_INSTANCE_HOST",
        defaultValue: "localhost:11434",
      },
      {
        name: "model",
        kind: "text",
        secret: false,
        required: true,
        labelKey: "CONNECTOR$FIELD_MODEL",
      },
    ],
    operations: [
      {
        id: "list_models",
        method: "GET",
        pathTemplate: "/api/tags",
        params: [],
      },
    ],
    probe: {
      vantage: ["runtime"],
      request: { method: "GET", pathTemplate: "/api/tags" },
      checks: [
        {
          id: "reachable",
          labelKey: "PROBE$CHECK_REACHABLE",
          kind: "status-in",
          statuses: [200],
        },
        {
          id: "models",
          labelKey: "PROBE$CHECK_MODELS",
          kind: "json-pointer-present",
          pointer: "/models",
        },
      ],
    },
    egress: [],
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    logo: "ollama.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "beta",
  },
  {
    id: "litellm",
    capability: "llm",
    nameKey: "CONNECTOR$LITELLM_NAME",
    descriptionKey: "CONNECTOR$LITELLM_DESC",
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
        helpKey: "CONNECTOR$FIELD_LITELLM_HOST_HELP",
      },
      {
        name: "apiKey",
        kind: "password",
        secret: true,
        required: true,
        labelKey: "CONNECTOR$FIELD_API_KEY",
        redact: "last4",
      },
    ],
    operations: [
      {
        id: "list_models",
        method: "GET",
        pathTemplate: "/v1/models",
        params: [],
      },
    ],
    probe: {
      vantage: ["runtime", "edge"],
      request: { method: "GET", pathTemplate: "/v1/models" },
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
    docsUrl: "https://docs.litellm.ai/docs/proxy/quick_start",
    logo: "litellm.svg",
    residency: ["us", "eu", "in", "global"],
    maturity: "beta",
  },
];
