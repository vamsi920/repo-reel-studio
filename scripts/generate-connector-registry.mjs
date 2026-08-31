#!/usr/bin/env node
/**
 * Generates the Deno mirror of the connector registry that the Edge Functions
 * import.
 *
 * The registry is authored once, in TypeScript, under
 * src/lib/environment/registry. The Edge Functions cannot import from `src/`
 * (different runtime, different module resolution, no bundler), so they read a
 * generated copy. Two hand-maintained registries would diverge, and the
 * divergence would show up as a provider whose form asks for one thing and
 * whose probe sends another.
 *
 * `__tests__/lib/environment/registry-mirror.test.ts` fails when the checked-in
 * output is stale, the same way `npm run make-i18n` is CI-enforced.
 *
 * Run: npm run make-connector-registry
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ROOT, "supabase", "functions", "_shared", "connector-registry");

async function loadManifests() {
  // Imported through tsx/esbuild-register is overkill for plain data; the
  // registry modules are type-only imports plus array literals, so stripping
  // types with a regex would be fragile. Use the TypeScript compiler that is
  // already a dependency.
  const ts = await import("typescript");
  const { readFileSync, readdirSync } = await import("node:fs");
  const registryDir = resolve(ROOT, "src", "lib", "environment", "registry");

  const files = readdirSync(registryDir).filter(
    (file) => file.endsWith(".ts") && file !== "index.ts",
  );

  const manifests = [];
  for (const file of files) {
    const source = readFileSync(resolve(registryDir, file), "utf8");
    const js = ts.default.transpileModule(source, {
      compilerOptions: {
        module: ts.default.ModuleKind.ESNext,
        target: ts.default.ScriptTarget.ES2022,
      },
    }).outputText;
    const dataUrl = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
    const module = await import(dataUrl);
    for (const value of Object.values(module)) {
      if (Array.isArray(value)) manifests.push(...value);
    }
  }
  return manifests;
}

const manifests = await loadManifests();
manifests.sort((a, b) => a.id.localeCompare(b.id));

const ids = new Set();
for (const manifest of manifests) {
  if (ids.has(manifest.id)) {
    process.stderr.write(`duplicate connector id: ${manifest.id}\n`);
    process.exit(1);
  }
  ids.add(manifest.id);
}

const header = `// GENERATED FILE -- do not edit.
// Source: src/lib/environment/registry/*.ts
// Regenerate with: npm run make-connector-registry
//
// The Edge Functions read this mirror because they cannot import from src/.
// A stale copy is a real bug (the form and the probe would disagree about a
// provider), so a test fails when this file does not match the source.
`;

const body = `${header}
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

export const CONNECTOR_MANIFESTS: ConnectorManifest[] = ${JSON.stringify(manifests, null, 2)};

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
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "index.ts"), body);
process.stdout.write(`${manifests.length} connector manifests mirrored to ${OUT_DIR}/index.ts\n`);
