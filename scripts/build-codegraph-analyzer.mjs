/**
 * Builds the CodeGraph analyzer payload that gets uploaded into the
 * agent-server sandbox and run there against the repository checkout.
 *
 * Output lands in `public/codegraph-analyzer/` so the browser can fetch the
 * pieces and push them across with `RemoteWorkspace.fileUpload`:
 *
 *   analyze.mjs                                  bundled analyzer
 *   node_modules/web-tree-sitter/...             parser runtime (kept external
 *                                                so its own .wasm still resolves)
 *   grammars/*.wasm                              one grammar per language
 *   manifest.json                                what to upload, and where
 *
 * Run via `npm run build:codegraph-analyzer` (wired into `build:app`).
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "codegraph-analyzer");

/**
 * Grammars we ship. Deliberately a subset: every grammar is ~1-3 MB that has to
 * be uploaded into the sandbox on first analysis, so we cover the languages
 * Neo workspaces actually contain and let the analyzer skip the rest
 * gracefully (upstream's plugin already degrades per-language).
 *
 * Dart and Swift are excluded on licensing grounds — see THIRD_PARTY_NOTICES.md.
 */
const GRAMMARS = [
  ["tree-sitter-typescript", "tree-sitter-typescript.wasm"],
  ["tree-sitter-typescript", "tree-sitter-tsx.wasm"],
  ["tree-sitter-javascript", "tree-sitter-javascript.wasm"],
  ["tree-sitter-python", "tree-sitter-python.wasm"],
  ["tree-sitter-go", "tree-sitter-go.wasm"],
  ["tree-sitter-java", "tree-sitter-java.wasm"],
  ["tree-sitter-rust", "tree-sitter-rust.wasm"],
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "grammars"), { recursive: true });

await build({
  entryPoints: [join(root, "src/lib/codegraph/analyzer-entry.ts")],
  outfile: join(outDir, "analyze.mjs"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  // web-tree-sitter loads its own `.wasm` relative to its file on disk, so
  // bundling it would break that lookup. It ships alongside instead.
  external: ["web-tree-sitter"],
  // Some dependencies in the analysis path are CJS (graphology reaches for
  // `events`). In an ESM bundle esbuild's own `require` shim throws on those,
  // so hand it a real one built from this module's URL.
  banner: {
    js: [
      'import { createRequire as __codegraphCreateRequire } from "node:module";',
      "const require = __codegraphCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});

/**
 * Resolves a file inside a package. `require.resolve` is tried first, but
 * several of these packages declare a restrictive `exports` map that hides
 * their `.wasm`/`package.json`, so fall back to the installed path directly.
 */
function resolvePackageFile(pkg, file) {
  try {
    return require.resolve(`${pkg}/${file}`);
  } catch {
    const direct = join(root, "node_modules", pkg, file);
    if (existsSync(direct)) return direct;
    return null;
  }
}

// --- web-tree-sitter runtime -------------------------------------------------
const wtsEntry = resolvePackageFile("web-tree-sitter", "web-tree-sitter.wasm");
if (!wtsEntry) throw new Error("web-tree-sitter is not installed");
const wtsDir = dirname(wtsEntry);
// Node resolves the bare `web-tree-sitter` specifier through node_modules
// lookup from analyze.mjs's own directory, so it has to live under one.
const wtsOut = join(outDir, "node_modules", "web-tree-sitter");
mkdirSync(wtsOut, { recursive: true });
for (const file of readdirSync(wtsDir)) {
  if (
    file === "package.json" ||
    file === "web-tree-sitter.js" ||
    file === "web-tree-sitter.wasm"
  ) {
    cpSync(join(wtsDir, file), join(wtsOut, file));
  }
}

// --- grammars ----------------------------------------------------------------
const grammarFiles = [];
for (const [pkg, file] of GRAMMARS) {
  const source = resolvePackageFile(pkg, file);
  if (!source) {
    console.warn(`[codegraph] grammar not installed, skipping: ${pkg}/${file}`);
    continue;
  }
  cpSync(source, join(outDir, "grammars", file));
  grammarFiles.push(file);
}

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      entry: "analyze.mjs",
      runtime: [
        "node_modules/web-tree-sitter/package.json",
        "node_modules/web-tree-sitter/web-tree-sitter.js",
        "node_modules/web-tree-sitter/web-tree-sitter.wasm",
      ],
      grammars: grammarFiles.map((file) => `grammars/${file}`),
    },
    null,
    2,
  ),
);

console.log(
  `[codegraph] analyzer built: ${grammarFiles.length} grammars -> ${outDir}`,
);
