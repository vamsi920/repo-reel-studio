// GENERATED FILE -- do not edit.
// Source: src/lib/environment/registry/*.ts
// Regenerate with: npm run make-connector-registry
//
// The Edge Functions read this mirror because they cannot import from src/.
// A stale copy is a real bug (the form and the probe would disagree about a
// provider), so a test fails when this file does not match the source.

export interface ConnectorManifest {
  id: string;
  capability: string;
  nameKey: string;
  descriptionKey: string;
  authKind: string;
  hostOverride?: { field: string; baseUrlTemplate: string };
  baseUrl?: string;
  fields: {
    name: string;
    kind: string;
    secret: boolean;
    required: boolean | { whenFieldEquals: [string, string] };
    labelKey: string;
    helpKey?: string;
    placeholderKey?: string;
    options?: { value: string; labelKey: string }[];
    pattern?: string;
    patternHintKey?: string;
    minLength?: number;
    maxLength?: number;
    defaultValue?: string | number | boolean;
    redact?: "full" | "last4" | "domain-only";
  }[];
  oauth?: Record<string, unknown>;
  operations?: {
    id: string;
    method: string;
    pathTemplate: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
    params?: string[];
  }[];
  probe: Record<string, unknown>;
  egress: { host: string; port: number; purposeKey: string; mirrorable: boolean; requiredFor?: string[] }[];
  docsUrl: string;
  logo: string;
  minVersion?: string;
  degradations?: Record<string, string>;
  residency?: string[];
  maturity: string;
}

export const CONNECTOR_MANIFESTS: ConnectorManifest[] = [
  {
    "id": "anthropic",
    "capability": "llm",
    "nameKey": "CONNECTOR$ANTHROPIC_NAME",
    "descriptionKey": "CONNECTOR$ANTHROPIC_DESC",
    "authKind": "api-key",
    "baseUrl": "https://api.anthropic.com/v1",
    "fields": [
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "pattern": "^sk-ant-",
        "patternHintKey": "CONNECTOR$FIELD_ANTHROPIC_KEY_PATTERN",
        "redact": "last4"
      }
    ],
    "operations": [
      {
        "id": "list_models",
        "method": "GET",
        "pathTemplate": "/models",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/models",
        "headers": {
          "anthropic-version": "2023-06-01"
        }
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "models",
          "labelKey": "PROBE$CHECK_MODELS",
          "kind": "json-pointer-present",
          "pointer": "/data"
        }
      ]
    },
    "egress": [
      {
        "host": "api.anthropic.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_ANTHROPIC",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.claude.com/en/api",
    "logo": "anthropic.svg",
    "residency": [
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "aws-bedrock",
    "capability": "llm",
    "nameKey": "CONNECTOR$BEDROCK_NAME",
    "descriptionKey": "CONNECTOR$BEDROCK_DESC",
    "authKind": "aws-sigv4",
    "hostOverride": {
      "field": "region",
      "baseUrlTemplate": "https://bedrock.{{region}}.amazonaws.com"
    },
    "fields": [
      {
        "name": "region",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_REGION",
        "defaultValue": "us-east-1"
      },
      {
        "name": "accessKeyId",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_ACCESS_KEY_ID"
      },
      {
        "name": "secretAccessKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_SECRET_ACCESS_KEY",
        "redact": "full"
      },
      {
        "name": "sessionToken",
        "kind": "password",
        "secret": true,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_AWS_SESSION_TOKEN",
        "redact": "full"
      }
    ],
    "operations": [
      {
        "id": "list_models",
        "method": "GET",
        "pathTemplate": "/foundation-models",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/foundation-models"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "*.amazonaws.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_BEDROCK",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.aws.amazon.com/bedrock/latest/APIReference/",
    "logo": "bedrock.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "aws-s3",
    "capability": "object-storage",
    "nameKey": "CONNECTOR$S3_NAME",
    "descriptionKey": "CONNECTOR$S3_DESC",
    "authKind": "aws-sigv4",
    "hostOverride": {
      "field": "endpoint",
      "baseUrlTemplate": "https://{{endpoint}}"
    },
    "fields": [
      {
        "name": "endpoint",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_S3_ENDPOINT",
        "helpKey": "CONNECTOR$FIELD_S3_ENDPOINT_HELP",
        "defaultValue": "s3.us-east-1.amazonaws.com"
      },
      {
        "name": "region",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_REGION",
        "defaultValue": "us-east-1"
      },
      {
        "name": "bucket",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_BUCKET"
      },
      {
        "name": "accessKeyId",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_ACCESS_KEY_ID"
      },
      {
        "name": "secretAccessKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_SECRET_ACCESS_KEY",
        "redact": "full"
      }
    ],
    "operations": [
      {
        "id": "put_object",
        "method": "PUT",
        "pathTemplate": "/{{bucket}}/{{key}}",
        "params": [
          "bucket",
          "key"
        ]
      },
      {
        "id": "get_object",
        "method": "GET",
        "pathTemplate": "/{{bucket}}/{{key}}",
        "params": [
          "bucket",
          "key"
        ]
      },
      {
        "id": "delete_object",
        "method": "DELETE",
        "pathTemplate": "/{{bucket}}/{{key}}",
        "params": [
          "bucket",
          "key"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/{{bucket}}?max-keys=1"
      },
      "checks": [
        {
          "id": "bucket",
          "labelKey": "PROBE$CHECK_BUCKET_ACCESS",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "*.amazonaws.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_S3",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.aws.amazon.com/AmazonS3/latest/API/",
    "logo": "s3.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "aws-secrets-manager",
    "capability": "secrets",
    "nameKey": "CONNECTOR$AWS_SECRETS_NAME",
    "descriptionKey": "CONNECTOR$AWS_SECRETS_DESC",
    "authKind": "aws-sigv4",
    "hostOverride": {
      "field": "region",
      "baseUrlTemplate": "https://secretsmanager.{{region}}.amazonaws.com"
    },
    "fields": [
      {
        "name": "region",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_REGION",
        "defaultValue": "us-east-1"
      },
      {
        "name": "accessKeyId",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_ACCESS_KEY_ID"
      },
      {
        "name": "secretAccessKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AWS_SECRET_ACCESS_KEY",
        "redact": "full"
      }
    ],
    "probe": {
      "vantage": [
        "runtime"
      ],
      "request": {
        "method": "POST",
        "pathTemplate": "/",
        "headers": {
          "X-Amz-Target": "secretsmanager.ListSecrets"
        },
        "bodyTemplate": "{\"MaxResults\":1}"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "*.amazonaws.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_AWS_SECRETS",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.aws.amazon.com/secretsmanager/latest/apireference/",
    "logo": "aws.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "azure-blob",
    "capability": "object-storage",
    "nameKey": "CONNECTOR$AZURE_BLOB_NAME",
    "descriptionKey": "CONNECTOR$AZURE_BLOB_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "accountHost",
      "baseUrlTemplate": "https://{{accountHost}}"
    },
    "fields": [
      {
        "name": "accountHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AZURE_ACCOUNT_HOST",
        "placeholderKey": "CONNECTOR$FIELD_AZURE_ACCOUNT_HOST_PLACEHOLDER"
      },
      {
        "name": "container",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_CONTAINER"
      },
      {
        "name": "sasToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_SAS_TOKEN",
        "helpKey": "CONNECTOR$FIELD_SAS_TOKEN_HELP",
        "redact": "full"
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/{{container}}?restype=container&comp=list&maxresults=1"
      },
      "checks": [
        {
          "id": "container",
          "labelKey": "PROBE$CHECK_CONTAINER_ACCESS",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "*.blob.core.windows.net",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_AZURE_BLOB",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://learn.microsoft.com/rest/api/storageservices/blob-service-rest-api",
    "logo": "azure.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "azure-openai",
    "capability": "llm",
    "nameKey": "CONNECTOR$AZURE_OPENAI_NAME",
    "descriptionKey": "CONNECTOR$AZURE_OPENAI_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "resourceHost",
      "baseUrlTemplate": "https://{{resourceHost}}/openai"
    },
    "fields": [
      {
        "name": "resourceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_AZURE_RESOURCE_HOST",
        "placeholderKey": "CONNECTOR$FIELD_AZURE_RESOURCE_HOST_PLACEHOLDER"
      },
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "redact": "last4"
      },
      {
        "name": "apiVersion",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_VERSION",
        "defaultValue": "2024-10-21"
      },
      {
        "name": "deployment",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_DEPLOYMENT"
      }
    ],
    "operations": [
      {
        "id": "list_deployments",
        "method": "GET",
        "pathTemplate": "/deployments",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/deployments?api-version={{apiVersion}}"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "*.openai.azure.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_AZURE_OPENAI",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://learn.microsoft.com/azure/ai-services/openai/reference",
    "logo": "azure.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "bitbucket-cloud",
    "capability": "source-control",
    "nameKey": "CONNECTOR$BITBUCKET_NAME",
    "descriptionKey": "CONNECTOR$BITBUCKET_DESC",
    "authKind": "oauth2-pkce",
    "baseUrl": "https://api.bitbucket.org/2.0",
    "fields": [],
    "oauth": {
      "authorizeUrlTemplate": "https://bitbucket.org/site/oauth2/authorize",
      "tokenUrlTemplate": "https://bitbucket.org/site/oauth2/access_token",
      "scopes": [
        "repository",
        "account"
      ],
      "optionalScopes": [
        "pullrequest"
      ],
      "usesPkce": true,
      "refreshable": true,
      "clientIdEnv": "BITBUCKET_OAUTH_CLIENT_ID",
      "clientSecretEnv": "BITBUCKET_OAUTH_CLIENT_SECRET",
      "identity": {
        "pathTemplate": "/user",
        "idPointer": "/uuid",
        "namePointer": "/username"
      }
    },
    "operations": [
      {
        "id": "list_repositories",
        "method": "GET",
        "pathTemplate": "/repositories/{{workspace}}",
        "params": [
          "workspace",
          "page",
          "pagelen"
        ]
      },
      {
        "id": "list_branches",
        "method": "GET",
        "pathTemplate": "/repositories/{{workspace}}/{{repo}}/refs/branches",
        "params": [
          "workspace",
          "repo",
          "pagelen"
        ]
      },
      {
        "id": "list_pull_requests",
        "method": "GET",
        "pathTemplate": "/repositories/{{workspace}}/{{repo}}/pullrequests",
        "params": [
          "workspace",
          "repo",
          "state",
          "pagelen"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/user"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "identity",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/username"
        }
      ]
    },
    "egress": [
      {
        "host": "api.bitbucket.org",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_BITBUCKET_API",
        "mirrorable": false
      },
      {
        "host": "bitbucket.org",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_BITBUCKET_WEB",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://developer.atlassian.com/cloud/bitbucket/oauth-2/",
    "logo": "bitbucket.svg",
    "residency": [
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "bitbucket-dc",
    "capability": "source-control",
    "nameKey": "CONNECTOR$BITBUCKET_DC_NAME",
    "descriptionKey": "CONNECTOR$BITBUCKET_DC_DESC",
    "authKind": "bearer-token",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}/rest/api/1.0"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "accessToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_ACCESS_TOKEN",
        "helpKey": "CONNECTOR$FIELD_BITBUCKET_DC_TOKEN_HELP",
        "redact": "last4"
      }
    ],
    "operations": [
      {
        "id": "list_repositories",
        "method": "GET",
        "pathTemplate": "/repos",
        "params": [
          "limit",
          "start"
        ]
      },
      {
        "id": "list_branches",
        "method": "GET",
        "pathTemplate": "/projects/{{project}}/repos/{{repo}}/branches",
        "params": [
          "project",
          "repo",
          "limit"
        ]
      },
      {
        "id": "list_pull_requests",
        "method": "GET",
        "pathTemplate": "/projects/{{project}}/repos/{{repo}}/pull-requests",
        "params": [
          "project",
          "repo",
          "state",
          "limit"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/repos?limit=1"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://confluence.atlassian.com/bitbucketserver/personal-access-tokens-939515499.html",
    "logo": "bitbucket.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "datadog",
    "capability": "observability",
    "nameKey": "CONNECTOR$DATADOG_NAME",
    "descriptionKey": "CONNECTOR$DATADOG_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "site",
      "baseUrlTemplate": "https://api.{{site}}"
    },
    "fields": [
      {
        "name": "site",
        "kind": "select",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_DATADOG_SITE",
        "defaultValue": "datadoghq.com",
        "options": [
          {
            "value": "datadoghq.com",
            "labelKey": "CONNECTOR$DATADOG_SITE_US"
          },
          {
            "value": "datadoghq.eu",
            "labelKey": "CONNECTOR$DATADOG_SITE_EU"
          },
          {
            "value": "ap1.datadoghq.com",
            "labelKey": "CONNECTOR$DATADOG_SITE_AP"
          }
        ]
      },
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "redact": "last4"
      },
      {
        "name": "appKey",
        "kind": "password",
        "secret": true,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_APP_KEY",
        "redact": "last4"
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/api/v1/validate"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "valid",
          "labelKey": "PROBE$CHECK_KEY_VALID",
          "kind": "json-pointer-equals",
          "pointer": "/valid",
          "value": true
        }
      ]
    },
    "egress": [
      {
        "host": "*.datadoghq.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_DATADOG",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.datadoghq.com/api/latest/",
    "logo": "datadog.svg",
    "residency": [
      "us",
      "eu",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "elasticsearch",
    "capability": "vector-store",
    "nameKey": "CONNECTOR$ELASTICSEARCH_NAME",
    "descriptionKey": "CONNECTOR$ELASTICSEARCH_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "helpKey": "CONNECTOR$FIELD_ES_KEY_HELP",
        "redact": "last4"
      },
      {
        "name": "index",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INDEX"
      }
    ],
    "operations": [
      {
        "id": "query",
        "method": "POST",
        "pathTemplate": "/{{index}}/_search",
        "params": [
          "index"
        ]
      },
      {
        "id": "upsert",
        "method": "POST",
        "pathTemplate": "/{{index}}/_doc/{{docId}}",
        "params": [
          "index",
          "docId"
        ]
      },
      {
        "id": "delete",
        "method": "DELETE",
        "pathTemplate": "/{{index}}/_doc/{{docId}}",
        "params": [
          "index",
          "docId"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/{{index}}"
      },
      "checks": [
        {
          "id": "index",
          "labelKey": "PROBE$CHECK_INDEX",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html",
    "logo": "elasticsearch.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "entra-id",
    "capability": "identity",
    "nameKey": "CONNECTOR$ENTRA_NAME",
    "descriptionKey": "CONNECTOR$ENTRA_DESC",
    "authKind": "oauth2-client-credentials",
    "baseUrl": "https://graph.microsoft.com/v1.0",
    "fields": [
      {
        "name": "tenantId",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_TENANT_ID"
      },
      {
        "name": "clientId",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_CLIENT_ID"
      },
      {
        "name": "clientSecret",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_CLIENT_SECRET",
        "redact": "full"
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/organization"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "login.microsoftonline.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_ENTRA_LOGIN",
        "mirrorable": false
      },
      {
        "host": "graph.microsoft.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_GRAPH",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://learn.microsoft.com/graph/auth-v2-service",
    "logo": "entra.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "github",
    "capability": "source-control",
    "nameKey": "CONNECTOR$GITHUB_NAME",
    "descriptionKey": "CONNECTOR$GITHUB_DESC",
    "authKind": "oauth2-pkce",
    "baseUrl": "https://api.github.com",
    "fields": [],
    "oauth": {
      "authorizeUrlTemplate": "https://github.com/login/oauth/authorize",
      "tokenUrlTemplate": "https://github.com/login/oauth/access_token",
      "scopes": [
        "repo",
        "read:user"
      ],
      "optionalScopes": [
        "workflow"
      ],
      "usesPkce": true,
      "refreshable": false,
      "clientIdEnv": "GITHUB_OAUTH_CLIENT_ID",
      "clientSecretEnv": "GITHUB_OAUTH_CLIENT_SECRET",
      "identity": {
        "pathTemplate": "/user",
        "idPointer": "/id",
        "namePointer": "/login"
      }
    },
    "operations": [
      {
        "id": "list_repositories",
        "method": "GET",
        "pathTemplate": "/user/repos",
        "params": [
          "page",
          "per_page",
          "sort"
        ]
      },
      {
        "id": "search_repositories",
        "method": "GET",
        "pathTemplate": "/search/repositories",
        "params": [
          "q",
          "per_page"
        ]
      },
      {
        "id": "list_branches",
        "method": "GET",
        "pathTemplate": "/repos/{{owner}}/{{repo}}/branches",
        "params": [
          "owner",
          "repo",
          "per_page"
        ]
      },
      {
        "id": "list_pull_requests",
        "method": "GET",
        "pathTemplate": "/repos/{{owner}}/{{repo}}/pulls",
        "params": [
          "owner",
          "repo",
          "state",
          "per_page"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/user"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "identity",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/login"
        }
      ],
      "scopeSource": {
        "from": "header",
        "name": "x-oauth-scopes",
        "separator": ","
      }
    },
    "egress": [
      {
        "host": "api.github.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_GITHUB_API",
        "mirrorable": false
      },
      {
        "host": "github.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_GITHUB_WEB",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.github.com/en/apps/oauth-apps",
    "logo": "github.svg",
    "degradations": {
      "repositories.clone": "CONNECTOR$GITHUB_DEGRADE_NO_REPO_SCOPE",
      "automations.pull-request": "CONNECTOR$GITHUB_DEGRADE_NO_WORKFLOW_SCOPE"
    },
    "residency": [
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "github-actions",
    "capability": "ci",
    "nameKey": "CONNECTOR$GH_ACTIONS_NAME",
    "descriptionKey": "CONNECTOR$GH_ACTIONS_DESC",
    "authKind": "none",
    "baseUrl": "https://api.github.com",
    "fields": [],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/user"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ],
      "scopeSource": {
        "from": "header",
        "name": "x-oauth-scopes",
        "separator": ","
      }
    },
    "egress": [
      {
        "host": "api.github.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_GITHUB_API",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.github.com/en/rest/actions",
    "logo": "github.svg",
    "degradations": {
      "ci.dispatch": "CONNECTOR$GH_ACTIONS_DEGRADE_NO_WORKFLOW_SCOPE"
    },
    "residency": [
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "github-enterprise",
    "capability": "source-control",
    "nameKey": "CONNECTOR$GHES_NAME",
    "descriptionKey": "CONNECTOR$GHES_DESC",
    "authKind": "oauth2-pkce",
    "hostOverride": {
      "field": "enterpriseHost",
      "baseUrlTemplate": "https://{{enterpriseHost}}/api/v3"
    },
    "fields": [
      {
        "name": "enterpriseHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_ENTERPRISE_HOST",
        "helpKey": "CONNECTOR$FIELD_ENTERPRISE_HOST_HELP",
        "placeholderKey": "CONNECTOR$FIELD_ENTERPRISE_HOST_PLACEHOLDER"
      }
    ],
    "oauth": {
      "authorizeUrlTemplate": "https://{{enterpriseHost}}/login/oauth/authorize",
      "tokenUrlTemplate": "https://{{enterpriseHost}}/login/oauth/access_token",
      "scopes": [
        "repo",
        "read:user"
      ],
      "usesPkce": true,
      "refreshable": false,
      "clientIdEnv": "GITHUB_ENTERPRISE_OAUTH_CLIENT_ID",
      "clientSecretEnv": "GITHUB_ENTERPRISE_OAUTH_CLIENT_SECRET",
      "identity": {
        "pathTemplate": "/user",
        "idPointer": "/id",
        "namePointer": "/login"
      }
    },
    "operations": [
      {
        "id": "list_repositories",
        "method": "GET",
        "pathTemplate": "/user/repos",
        "params": [
          "page",
          "per_page",
          "sort"
        ]
      },
      {
        "id": "search_repositories",
        "method": "GET",
        "pathTemplate": "/search/repositories",
        "params": [
          "q",
          "per_page"
        ]
      },
      {
        "id": "list_branches",
        "method": "GET",
        "pathTemplate": "/repos/{{owner}}/{{repo}}/branches",
        "params": [
          "owner",
          "repo",
          "per_page"
        ]
      },
      {
        "id": "list_pull_requests",
        "method": "GET",
        "pathTemplate": "/repos/{{owner}}/{{repo}}/pulls",
        "params": [
          "owner",
          "repo",
          "state",
          "per_page"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/user"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "identity",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/login"
        }
      ],
      "scopeSource": {
        "from": "header",
        "name": "x-oauth-scopes",
        "separator": ","
      },
      "versionSource": {
        "from": "header",
        "name": "x-github-enterprise-version"
      }
    },
    "egress": [],
    "docsUrl": "https://docs.github.com/en/enterprise-server/admin",
    "logo": "github-enterprise.svg",
    "minVersion": "3.9",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "gitlab-com",
    "capability": "source-control",
    "nameKey": "CONNECTOR$GITLAB_NAME",
    "descriptionKey": "CONNECTOR$GITLAB_DESC",
    "authKind": "oauth2-pkce",
    "baseUrl": "https://gitlab.com/api/v4",
    "fields": [],
    "oauth": {
      "authorizeUrlTemplate": "https://gitlab.com/oauth/authorize",
      "tokenUrlTemplate": "https://gitlab.com/oauth/token",
      "scopes": [
        "read_api",
        "read_repository"
      ],
      "optionalScopes": [
        "write_repository",
        "api"
      ],
      "usesPkce": true,
      "refreshable": true,
      "clientIdEnv": "GITLAB_OAUTH_CLIENT_ID",
      "clientSecretEnv": "GITLAB_OAUTH_CLIENT_SECRET",
      "identity": {
        "pathTemplate": "/user",
        "idPointer": "/id",
        "namePointer": "/username"
      }
    },
    "operations": [
      {
        "id": "list_repositories",
        "method": "GET",
        "pathTemplate": "/projects",
        "params": [
          "membership",
          "page",
          "per_page",
          "order_by"
        ]
      },
      {
        "id": "search_repositories",
        "method": "GET",
        "pathTemplate": "/projects",
        "params": [
          "search",
          "per_page"
        ]
      },
      {
        "id": "list_branches",
        "method": "GET",
        "pathTemplate": "/projects/{{projectId}}/repository/branches",
        "params": [
          "projectId",
          "per_page"
        ]
      },
      {
        "id": "list_pull_requests",
        "method": "GET",
        "pathTemplate": "/projects/{{projectId}}/merge_requests",
        "params": [
          "projectId",
          "state",
          "per_page"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/user"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "identity",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/username"
        }
      ]
    },
    "egress": [
      {
        "host": "gitlab.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_GITLAB",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.gitlab.com/ee/api/oauth2.html",
    "logo": "gitlab.svg",
    "residency": [
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "gitlab-self-managed",
    "capability": "source-control",
    "nameKey": "CONNECTOR$GITLAB_SELF_NAME",
    "descriptionKey": "CONNECTOR$GITLAB_SELF_DESC",
    "authKind": "bearer-token",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}/api/v4"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST",
        "helpKey": "CONNECTOR$FIELD_INSTANCE_HOST_HELP"
      },
      {
        "name": "accessToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_ACCESS_TOKEN",
        "helpKey": "CONNECTOR$FIELD_GITLAB_TOKEN_HELP",
        "redact": "last4"
      }
    ],
    "operations": [
      {
        "id": "list_repositories",
        "method": "GET",
        "pathTemplate": "/projects",
        "params": [
          "membership",
          "page",
          "per_page",
          "order_by"
        ]
      },
      {
        "id": "list_branches",
        "method": "GET",
        "pathTemplate": "/projects/{{projectId}}/repository/branches",
        "params": [
          "projectId",
          "per_page"
        ]
      },
      {
        "id": "list_pull_requests",
        "method": "GET",
        "pathTemplate": "/projects/{{projectId}}/merge_requests",
        "params": [
          "projectId",
          "state",
          "per_page"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/version"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "version",
          "labelKey": "PROBE$CHECK_VERSION",
          "kind": "json-pointer-present",
          "pointer": "/version"
        }
      ],
      "versionSource": {
        "from": "json",
        "pointer": "/version"
      }
    },
    "egress": [],
    "docsUrl": "https://docs.gitlab.com/ee/api/rest/",
    "logo": "gitlab.svg",
    "minVersion": "16.0",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "google-gemini",
    "capability": "llm",
    "nameKey": "CONNECTOR$GEMINI_NAME",
    "descriptionKey": "CONNECTOR$GEMINI_DESC",
    "authKind": "api-key",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
    "fields": [
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "redact": "last4"
      },
      {
        "name": "model",
        "kind": "text",
        "secret": false,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_MODEL",
        "defaultValue": "gemini-pro-latest"
      }
    ],
    "operations": [
      {
        "id": "list_models",
        "method": "GET",
        "pathTemplate": "/models",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/models"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "models",
          "labelKey": "PROBE$CHECK_MODELS",
          "kind": "json-pointer-present",
          "pointer": "/models"
        }
      ]
    },
    "egress": [
      {
        "host": "generativelanguage.googleapis.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_GEMINI",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://ai.google.dev/gemini-api/docs",
    "logo": "gemini.svg",
    "residency": [
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "hashicorp-vault",
    "capability": "secrets",
    "nameKey": "CONNECTOR$VAULT_NAME",
    "descriptionKey": "CONNECTOR$VAULT_DESC",
    "authKind": "bearer-token",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}/v1"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "mountPath",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_VAULT_MOUNT",
        "defaultValue": "secret"
      },
      {
        "name": "token",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_VAULT_TOKEN",
        "helpKey": "CONNECTOR$FIELD_VAULT_TOKEN_HELP",
        "redact": "full"
      }
    ],
    "operations": [
      {
        "id": "read_secret",
        "method": "GET",
        "pathTemplate": "/{{mountPath}}/data/{{path}}",
        "params": [
          "mountPath",
          "path"
        ]
      },
      {
        "id": "write_secret",
        "method": "POST",
        "pathTemplate": "/{{mountPath}}/data/{{path}}",
        "params": [
          "mountPath",
          "path"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/sys/health"
      },
      "checks": [
        {
          "id": "reachable",
          "labelKey": "PROBE$CHECK_REACHABLE",
          "kind": "status-in",
          "statuses": [
            200,
            429
          ]
        },
        {
          "id": "unsealed",
          "labelKey": "PROBE$CHECK_VAULT_UNSEALED",
          "kind": "json-pointer-equals",
          "pointer": "/sealed",
          "value": false
        }
      ],
      "versionSource": {
        "from": "json",
        "pointer": "/version"
      }
    },
    "egress": [],
    "docsUrl": "https://developer.hashicorp.com/vault/api-docs",
    "logo": "vault.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "jenkins",
    "capability": "ci",
    "nameKey": "CONNECTOR$JENKINS_NAME",
    "descriptionKey": "CONNECTOR$JENKINS_DESC",
    "authKind": "basic",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "username",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_USERNAME"
      },
      {
        "name": "apiToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_TOKEN",
        "redact": "last4"
      }
    ],
    "probe": {
      "vantage": [
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/api/json?tree=mode"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ],
      "versionSource": {
        "from": "header",
        "name": "x-jenkins"
      }
    },
    "egress": [],
    "docsUrl": "https://www.jenkins.io/doc/book/using/remote-access-api/",
    "logo": "jenkins.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "jira-cloud",
    "capability": "issue-tracker",
    "nameKey": "CONNECTOR$JIRA_NAME",
    "descriptionKey": "CONNECTOR$JIRA_DESC",
    "authKind": "oauth2-pkce",
    "baseUrl": "https://api.atlassian.com",
    "fields": [],
    "oauth": {
      "authorizeUrlTemplate": "https://auth.atlassian.com/authorize",
      "tokenUrlTemplate": "https://auth.atlassian.com/oauth/token",
      "scopes": [
        "read:jira-work",
        "read:jira-user",
        "offline_access"
      ],
      "optionalScopes": [
        "write:jira-work",
        "manage:jira-webhook"
      ],
      "usesPkce": true,
      "refreshable": true,
      "clientIdEnv": "JIRA_CLIENT_ID",
      "clientSecretEnv": "JIRA_CLIENT_SECRET",
      "extraAuthorizeParams": {
        "audience": "api.atlassian.com",
        "prompt": "consent"
      },
      "identity": {
        "pathTemplate": "/oauth/token/accessible-resources",
        "idPointer": "/0/id",
        "namePointer": "/0/name"
      }
    },
    "operations": [
      {
        "id": "list_issues",
        "method": "GET",
        "pathTemplate": "/ex/jira/{{cloudId}}/rest/api/3/search",
        "params": [
          "cloudId",
          "jql",
          "maxResults",
          "startAt"
        ]
      },
      {
        "id": "get_issue",
        "method": "GET",
        "pathTemplate": "/ex/jira/{{cloudId}}/rest/api/3/issue/{{issueKey}}",
        "params": [
          "cloudId",
          "issueKey"
        ]
      },
      {
        "id": "create_issue",
        "method": "POST",
        "pathTemplate": "/ex/jira/{{cloudId}}/rest/api/3/issue",
        "params": [
          "cloudId"
        ]
      },
      {
        "id": "transition_issue",
        "method": "POST",
        "pathTemplate": "/ex/jira/{{cloudId}}/rest/api/3/issue/{{issueKey}}/transitions",
        "params": [
          "cloudId",
          "issueKey"
        ]
      },
      {
        "id": "register_webhook",
        "method": "POST",
        "pathTemplate": "/ex/jira/{{cloudId}}/rest/api/3/webhook",
        "params": [
          "cloudId"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/oauth/token/accessible-resources"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "site",
          "labelKey": "PROBE$CHECK_JIRA_SITE",
          "kind": "json-pointer-present",
          "pointer": "/0/id"
        }
      ],
      "scopeSource": {
        "from": "json",
        "pointer": "/0/scopes",
        "separator": " "
      }
    },
    "egress": [
      {
        "host": "auth.atlassian.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_ATLASSIAN_AUTH",
        "mirrorable": false
      },
      {
        "host": "api.atlassian.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_ATLASSIAN_API",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/",
    "logo": "jira.svg",
    "degradations": {
      "automations.jira-trigger": "CONNECTOR$JIRA_DEGRADE_NO_WEBHOOK_SCOPE",
      "issues.create": "CONNECTOR$JIRA_DEGRADE_READ_ONLY"
    },
    "residency": [
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "jira-dc",
    "capability": "issue-tracker",
    "nameKey": "CONNECTOR$JIRA_DC_NAME",
    "descriptionKey": "CONNECTOR$JIRA_DC_DESC",
    "authKind": "bearer-token",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}/rest/api/2"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "accessToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_ACCESS_TOKEN",
        "helpKey": "CONNECTOR$FIELD_JIRA_DC_TOKEN_HELP",
        "redact": "last4"
      }
    ],
    "operations": [
      {
        "id": "list_issues",
        "method": "GET",
        "pathTemplate": "/search",
        "params": [
          "jql",
          "maxResults",
          "startAt"
        ]
      },
      {
        "id": "get_issue",
        "method": "GET",
        "pathTemplate": "/issue/{{issueKey}}",
        "params": [
          "issueKey"
        ]
      },
      {
        "id": "create_issue",
        "method": "POST",
        "pathTemplate": "/issue",
        "params": []
      },
      {
        "id": "transition_issue",
        "method": "POST",
        "pathTemplate": "/issue/{{issueKey}}/transitions",
        "params": [
          "issueKey"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/myself"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "identity",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/name"
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html",
    "logo": "jira.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "linear",
    "capability": "issue-tracker",
    "nameKey": "CONNECTOR$LINEAR_NAME",
    "descriptionKey": "CONNECTOR$LINEAR_DESC",
    "authKind": "api-key",
    "baseUrl": "https://api.linear.app",
    "fields": [
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "helpKey": "CONNECTOR$FIELD_LINEAR_KEY_HELP",
        "pattern": "^lin_api_[A-Za-z0-9]+$",
        "patternHintKey": "CONNECTOR$FIELD_LINEAR_KEY_PATTERN",
        "redact": "last4"
      }
    ],
    "operations": [
      {
        "id": "graphql",
        "method": "POST",
        "pathTemplate": "/graphql",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "POST",
        "pathTemplate": "/graphql",
        "headers": {
          "Content-Type": "application/json"
        },
        "bodyTemplate": "{\"query\":\"{ viewer { id name } }\"}"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "identity",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/data/viewer/id"
        }
      ]
    },
    "egress": [
      {
        "host": "api.linear.app",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_LINEAR",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    "logo": "linear.svg",
    "residency": [
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "litellm",
    "capability": "llm",
    "nameKey": "CONNECTOR$LITELLM_NAME",
    "descriptionKey": "CONNECTOR$LITELLM_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST",
        "helpKey": "CONNECTOR$FIELD_LITELLM_HOST_HELP"
      },
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "redact": "last4"
      }
    ],
    "operations": [
      {
        "id": "list_models",
        "method": "GET",
        "pathTemplate": "/v1/models",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/v1/models"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://docs.litellm.ai/docs/proxy/quick_start",
    "logo": "litellm.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "microsoft-teams",
    "capability": "notifications",
    "nameKey": "CONNECTOR$TEAMS_NAME",
    "descriptionKey": "CONNECTOR$TEAMS_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "webhookHost",
      "baseUrlTemplate": "https://{{webhookHost}}"
    },
    "fields": [
      {
        "name": "webhookHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_TEAMS_WEBHOOK_HOST"
      },
      {
        "name": "webhookPath",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_TEAMS_WEBHOOK_PATH",
        "helpKey": "CONNECTOR$FIELD_TEAMS_WEBHOOK_PATH_HELP",
        "redact": "full"
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/"
      },
      "checks": [
        {
          "id": "reachable",
          "labelKey": "PROBE$CHECK_REACHABLE",
          "kind": "status-in",
          "statuses": [
            200,
            400,
            405
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "*.webhook.office.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_TEAMS",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook",
    "logo": "teams.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "okta",
    "capability": "identity",
    "nameKey": "CONNECTOR$OKTA_NAME",
    "descriptionKey": "CONNECTOR$OKTA_DESC",
    "authKind": "bearer-token",
    "hostOverride": {
      "field": "orgHost",
      "baseUrlTemplate": "https://{{orgHost}}/api/v1"
    },
    "fields": [
      {
        "name": "orgHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_OKTA_ORG_HOST",
        "placeholderKey": "CONNECTOR$FIELD_OKTA_ORG_HOST_PLACEHOLDER"
      },
      {
        "name": "apiToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_TOKEN",
        "helpKey": "CONNECTOR$FIELD_OKTA_TOKEN_HELP",
        "redact": "last4"
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/org"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "org",
          "labelKey": "PROBE$CHECK_IDENTITY",
          "kind": "json-pointer-present",
          "pointer": "/id"
        }
      ]
    },
    "egress": [
      {
        "host": "*.okta.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_OKTA",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://developer.okta.com/docs/reference/core-okta-api/",
    "logo": "okta.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "ollama",
    "capability": "llm",
    "nameKey": "CONNECTOR$OLLAMA_NAME",
    "descriptionKey": "CONNECTOR$OLLAMA_DESC",
    "authKind": "none",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "http://{{instanceHost}}"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST",
        "defaultValue": "localhost:11434"
      },
      {
        "name": "model",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_MODEL"
      }
    ],
    "operations": [
      {
        "id": "list_models",
        "method": "GET",
        "pathTemplate": "/api/tags",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/api/tags"
      },
      "checks": [
        {
          "id": "reachable",
          "labelKey": "PROBE$CHECK_REACHABLE",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "models",
          "labelKey": "PROBE$CHECK_MODELS",
          "kind": "json-pointer-present",
          "pointer": "/models"
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://github.com/ollama/ollama/blob/main/docs/api.md",
    "logo": "ollama.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "openai",
    "capability": "llm",
    "nameKey": "CONNECTOR$OPENAI_NAME",
    "descriptionKey": "CONNECTOR$OPENAI_DESC",
    "authKind": "api-key",
    "baseUrl": "https://api.openai.com/v1",
    "fields": [
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "pattern": "^sk-",
        "patternHintKey": "CONNECTOR$FIELD_OPENAI_KEY_PATTERN",
        "redact": "last4"
      },
      {
        "name": "organization",
        "kind": "text",
        "secret": false,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_ORGANIZATION"
      }
    ],
    "operations": [
      {
        "id": "list_models",
        "method": "GET",
        "pathTemplate": "/models",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/models"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "models",
          "labelKey": "PROBE$CHECK_MODELS",
          "kind": "json-pointer-present",
          "pointer": "/data"
        }
      ]
    },
    "egress": [
      {
        "host": "api.openai.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_OPENAI",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://platform.openai.com/docs/api-reference",
    "logo": "openai.svg",
    "residency": [
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "pinecone",
    "capability": "vector-store",
    "nameKey": "CONNECTOR$PINECONE_NAME",
    "descriptionKey": "CONNECTOR$PINECONE_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "indexHost",
      "baseUrlTemplate": "https://{{indexHost}}"
    },
    "fields": [
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "redact": "last4"
      },
      {
        "name": "indexHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_PINECONE_INDEX_HOST",
        "helpKey": "CONNECTOR$FIELD_PINECONE_INDEX_HOST_HELP",
        "placeholderKey": "CONNECTOR$FIELD_PINECONE_INDEX_HOST_PLACEHOLDER"
      },
      {
        "name": "namespace",
        "kind": "text",
        "secret": false,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_NAMESPACE",
        "helpKey": "CONNECTOR$FIELD_NAMESPACE_HELP"
      }
    ],
    "operations": [
      {
        "id": "query",
        "method": "POST",
        "pathTemplate": "/query",
        "params": []
      },
      {
        "id": "upsert",
        "method": "POST",
        "pathTemplate": "/vectors/upsert",
        "params": []
      },
      {
        "id": "delete",
        "method": "POST",
        "pathTemplate": "/vectors/delete",
        "params": []
      },
      {
        "id": "describe",
        "method": "GET",
        "pathTemplate": "/describe_index_stats",
        "params": []
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/describe_index_stats"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "dimension",
          "labelKey": "PROBE$CHECK_INDEX_DIMENSION",
          "kind": "json-pointer-present",
          "pointer": "/dimension"
        }
      ]
    },
    "egress": [
      {
        "host": "*.pinecone.io",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_PINECONE",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://docs.pinecone.io/reference/api",
    "logo": "pinecone.svg",
    "residency": [
      "us",
      "eu",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "postgres",
    "capability": "relational-db",
    "nameKey": "CONNECTOR$POSTGRES_NAME",
    "descriptionKey": "CONNECTOR$POSTGRES_DESC",
    "authKind": "basic",
    "hostOverride": {
      "field": "host",
      "baseUrlTemplate": "postgres://{{host}}"
    },
    "fields": [
      {
        "name": "host",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_DB_HOST"
      },
      {
        "name": "database",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_DB_NAME"
      },
      {
        "name": "username",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_USERNAME"
      },
      {
        "name": "password",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_PASSWORD",
        "redact": "full"
      },
      {
        "name": "sslMode",
        "kind": "select",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_SSL_MODE",
        "defaultValue": "require",
        "options": [
          {
            "value": "require",
            "labelKey": "CONNECTOR$SSL_REQUIRE"
          },
          {
            "value": "verify-full",
            "labelKey": "CONNECTOR$SSL_VERIFY_FULL"
          },
          {
            "value": "disable",
            "labelKey": "CONNECTOR$SSL_DISABLE"
          }
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": ""
      },
      "checks": [
        {
          "id": "connect",
          "labelKey": "PROBE$CHECK_DB_CONNECT",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://www.postgresql.org/docs/current/libpq-connect.html",
    "logo": "postgres.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "posthog",
    "capability": "observability",
    "nameKey": "CONNECTOR$POSTHOG_NAME",
    "descriptionKey": "CONNECTOR$POSTHOG_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST",
        "defaultValue": "us.i.posthog.com"
      },
      {
        "name": "projectApiKey",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_PROJECT_API_KEY",
        "redact": "last4"
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/decide?v=3"
      },
      "checks": [
        {
          "id": "reachable",
          "labelKey": "PROBE$CHECK_REACHABLE",
          "kind": "status-in",
          "statuses": [
            200,
            401
          ]
        }
      ]
    },
    "egress": [
      {
        "host": "us.i.posthog.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_POSTHOG",
        "mirrorable": false,
        "requiredFor": [
          "telemetry"
        ]
      }
    ],
    "trafficPath": "direct",
    "docsUrl": "https://posthog.com/docs/api",
    "logo": "posthog.svg",
    "residency": [
      "us",
      "eu",
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "qdrant",
    "capability": "vector-store",
    "nameKey": "CONNECTOR$QDRANT_NAME",
    "descriptionKey": "CONNECTOR$QDRANT_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "helpKey": "CONNECTOR$FIELD_QDRANT_KEY_HELP",
        "redact": "last4"
      },
      {
        "name": "collection",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_COLLECTION"
      }
    ],
    "operations": [
      {
        "id": "query",
        "method": "POST",
        "pathTemplate": "/collections/{{collection}}/points/search",
        "params": [
          "collection"
        ]
      },
      {
        "id": "upsert",
        "method": "PUT",
        "pathTemplate": "/collections/{{collection}}/points",
        "params": [
          "collection"
        ]
      },
      {
        "id": "delete",
        "method": "POST",
        "pathTemplate": "/collections/{{collection}}/points/delete",
        "params": [
          "collection"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/collections/{{collection}}"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "collection",
          "labelKey": "PROBE$CHECK_COLLECTION",
          "kind": "json-pointer-present",
          "pointer": "/result/status"
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://qdrant.tech/documentation/concepts/points/",
    "logo": "qdrant.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "slack",
    "capability": "notifications",
    "nameKey": "CONNECTOR$SLACK_NAME",
    "descriptionKey": "CONNECTOR$SLACK_DESC",
    "authKind": "bearer-token",
    "baseUrl": "https://slack.com/api",
    "fields": [
      {
        "name": "botToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_SLACK_BOT_TOKEN",
        "pattern": "^xoxb-",
        "patternHintKey": "CONNECTOR$FIELD_SLACK_TOKEN_PATTERN",
        "helpKey": "CONNECTOR$FIELD_SLACK_BOT_TOKEN_HELP",
        "redact": "last4"
      },
      {
        "name": "defaultChannel",
        "kind": "text",
        "secret": false,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_DEFAULT_CHANNEL"
      }
    ],
    "operations": [
      {
        "id": "post_message",
        "method": "POST",
        "pathTemplate": "/chat.postMessage",
        "params": []
      },
      {
        "id": "list_channels",
        "method": "GET",
        "pathTemplate": "/conversations.list",
        "params": [
          "limit",
          "types"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "edge",
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/auth.test"
      },
      "checks": [
        {
          "id": "reachable",
          "labelKey": "PROBE$CHECK_REACHABLE",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "json-pointer-equals",
          "pointer": "/ok",
          "value": true
        }
      ],
      "scopeSource": {
        "from": "header",
        "name": "x-oauth-scopes",
        "separator": ","
      }
    },
    "egress": [
      {
        "host": "slack.com",
        "port": 443,
        "purposeKey": "PROBE$EGRESS_SLACK",
        "mirrorable": false
      }
    ],
    "docsUrl": "https://api.slack.com/authentication/token-types",
    "logo": "slack.svg",
    "residency": [
      "global"
    ],
    "maturity": "beta"
  },
  {
    "id": "supabase-pgvector",
    "capability": "vector-store",
    "nameKey": "CONNECTOR$PGVECTOR_NAME",
    "descriptionKey": "CONNECTOR$PGVECTOR_DESC",
    "authKind": "none",
    "fields": [],
    "probe": {
      "vantage": [
        "browser",
        "edge"
      ],
      "request": {
        "method": "POST",
        "pathTemplate": "/rest/v1/rpc/environment_installed_extensions"
      },
      "checks": [
        {
          "id": "extension",
          "labelKey": "PROBE$CHECK_PGVECTOR",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://supabase.com/docs/guides/ai/vector-columns",
    "logo": "pgvector.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "supabase-postgres",
    "capability": "relational-db",
    "nameKey": "CONNECTOR$SUPABASE_PG_NAME",
    "descriptionKey": "CONNECTOR$SUPABASE_PG_DESC",
    "authKind": "none",
    "fields": [],
    "probe": {
      "vantage": [
        "browser",
        "edge"
      ],
      "request": {
        "method": "POST",
        "pathTemplate": "/rest/v1/rpc/environment_installed_extensions"
      },
      "checks": [
        {
          "id": "reachable",
          "labelKey": "PROBE$CHECK_REACHABLE",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://supabase.com/docs/guides/database",
    "logo": "supabase.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "supabase-storage",
    "capability": "object-storage",
    "nameKey": "CONNECTOR$SUPABASE_STORAGE_NAME",
    "descriptionKey": "CONNECTOR$SUPABASE_STORAGE_DESC",
    "authKind": "none",
    "fields": [],
    "probe": {
      "vantage": [
        "browser",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/storage/v1/bucket"
      },
      "checks": [
        {
          "id": "buckets",
          "labelKey": "PROBE$CHECK_BUCKETS",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://supabase.com/docs/guides/storage",
    "logo": "supabase.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "ga"
  },
  {
    "id": "tigergraph",
    "capability": "vector-store",
    "nameKey": "CONNECTOR$TIGERGRAPH_NAME",
    "descriptionKey": "CONNECTOR$TIGERGRAPH_DESC",
    "authKind": "bearer-token",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}:9000"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "graphName",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_GRAPH_NAME"
      },
      {
        "name": "accessToken",
        "kind": "password",
        "secret": true,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_ACCESS_TOKEN",
        "helpKey": "CONNECTOR$FIELD_TIGERGRAPH_TOKEN_HELP",
        "redact": "last4"
      },
      {
        "name": "similarityQuery",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_TIGERGRAPH_QUERY",
        "helpKey": "CONNECTOR$FIELD_TIGERGRAPH_QUERY_HELP",
        "defaultValue": "vectorSearch"
      }
    ],
    "operations": [
      {
        "id": "query",
        "method": "POST",
        "pathTemplate": "/query/{{graphName}}/{{similarityQuery}}",
        "params": [
          "graphName",
          "similarityQuery"
        ]
      },
      {
        "id": "upsert",
        "method": "POST",
        "pathTemplate": "/graph/{{graphName}}",
        "params": [
          "graphName"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/echo"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        }
      ]
    },
    "egress": [],
    "docsUrl": "https://docs.tigergraph.com/tigergraph-server/current/api/built-in-endpoints",
    "logo": "tigergraph.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "experimental"
  },
  {
    "id": "weaviate",
    "capability": "vector-store",
    "nameKey": "CONNECTOR$WEAVIATE_NAME",
    "descriptionKey": "CONNECTOR$WEAVIATE_DESC",
    "authKind": "api-key",
    "hostOverride": {
      "field": "instanceHost",
      "baseUrlTemplate": "https://{{instanceHost}}/v1"
    },
    "fields": [
      {
        "name": "instanceHost",
        "kind": "host",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_INSTANCE_HOST"
      },
      {
        "name": "apiKey",
        "kind": "password",
        "secret": true,
        "required": false,
        "labelKey": "CONNECTOR$FIELD_API_KEY",
        "redact": "last4"
      },
      {
        "name": "className",
        "kind": "text",
        "secret": false,
        "required": true,
        "labelKey": "CONNECTOR$FIELD_WEAVIATE_CLASS"
      }
    ],
    "operations": [
      {
        "id": "query",
        "method": "POST",
        "pathTemplate": "/graphql",
        "params": []
      },
      {
        "id": "upsert",
        "method": "POST",
        "pathTemplate": "/objects",
        "params": []
      },
      {
        "id": "delete",
        "method": "DELETE",
        "pathTemplate": "/objects/{{className}}/{{objectId}}",
        "params": [
          "className",
          "objectId"
        ]
      }
    ],
    "probe": {
      "vantage": [
        "runtime",
        "edge"
      ],
      "request": {
        "method": "GET",
        "pathTemplate": "/meta"
      },
      "checks": [
        {
          "id": "auth",
          "labelKey": "PROBE$CHECK_AUTH",
          "kind": "status-in",
          "statuses": [
            200
          ]
        },
        {
          "id": "version",
          "labelKey": "PROBE$CHECK_VERSION",
          "kind": "json-pointer-present",
          "pointer": "/version"
        }
      ],
      "versionSource": {
        "from": "json",
        "pointer": "/version"
      }
    },
    "egress": [],
    "docsUrl": "https://weaviate.io/developers/weaviate/api/rest",
    "logo": "weaviate.svg",
    "residency": [
      "us",
      "eu",
      "in",
      "global"
    ],
    "maturity": "beta"
  }
];

const BY_ID = new Map(CONNECTOR_MANIFESTS.map((manifest) => [manifest.id, manifest]));

export function getConnectorManifest(id: string): ConnectorManifest | undefined {
  return BY_ID.get(id);
}

export function secretFieldNames(manifest: ConnectorManifest): string[] {
  return manifest.fields.filter((field) => field.secret).map((field) => field.name);
}

export function configFieldNames(manifest: ConnectorManifest): string[] {
  return manifest.fields.filter((field) => !field.secret).map((field) => field.name);
}
