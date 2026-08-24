/**
 * The CodeGraph analyzer, as it runs *inside the agent-server sandbox*.
 *
 * This file is never imported by the browser bundle. `scripts/build-codegraph-analyzer.mjs`
 * compiles it (plus the vendored Understand-Anything analysis path) into a
 * single `analyze.mjs`, which `analyzer-runner.ts` uploads next to the
 * repository checkout and executes with `RemoteWorkspace.executeCommand`.
 *
 * Running here rather than in the browser is the whole point: the checkout is
 * already on this filesystem, so analysing a 5,000-file repository reads local
 * files instead of pulling every one of them over HTTP.
 *
 * Output is written *sharded* — one file per drill-down level — so the browser
 * downloads the ~20-node system view first and fetches a subtree only when the
 * user actually drills into it.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";

import { GraphBuilder } from "../../../vendor/understand-anything/core/analyzer/graph-builder";
import { detectLayers } from "../../../vendor/understand-anything/core/analyzer/layer-detector";
import { TreeSitterPlugin } from "../../../vendor/understand-anything/core/plugins/tree-sitter-plugin";
import { builtinLanguageConfigs } from "../../../vendor/understand-anything/core/languages/configs/index";
import { DEFAULT_IGNORE_PATTERNS } from "../../../vendor/understand-anything/core/ignore-filter";
import type { KnowledgeGraph } from "../../../vendor/understand-anything/core/types";

import {
  breadcrumbsFor,
  buildHierarchy,
  type SubsystemHint,
} from "./hierarchy";
import { shardName } from "./shard-name";
import type { CodeGraphMeta } from "./codegraph-types";

interface Args {
  repo: string;
  out: string;
  commitSha: string;
  workspaceId: string;
  repositoryId: string;
  hints: string | null;
  grammars: string;
  maxFiles: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };
  const required = (name: string): string => {
    const value = get(name);
    if (!value) throw new Error(`Missing required argument --${name}`);
    return value;
  };
  return {
    repo: required("repo"),
    out: required("out"),
    commitSha: required("commit"),
    workspaceId: required("workspace"),
    repositoryId: required("repository"),
    hints: get("hints"),
    grammars: get("grammars") ?? "grammars",
    maxFiles: Number(get("max-files") ?? "8000"),
  };
}

/** Emitted as JSON lines on stdout so the browser can surface real progress. */
function progress(phase: string, detail: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ __codegraph: phase, ...detail })}\n`,
  );
}

const IGNORED_DIRS = new Set(
  DEFAULT_IGNORE_PATTERNS.filter((p) => p.endsWith("/")).map((p) =>
    p.replace(/\/$/, ""),
  ),
);

function walk(root: string, limit: number): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < limit) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".github") continue;
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(full);
      } else if (stats.isFile()) {
        files.push(full);
        if (files.length >= limit) break;
      }
    }
  }
  return files;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolvePath(args.repo);
  const grammarDir = resolvePath(args.grammars);

  progress("analyzing");

  // Grammars are uploaded flat next to the bundle; upstream's package-relative
  // `require.resolve` cannot work here, so we resolve by file name instead.
  const plugin = new TreeSitterPlugin(
    builtinLanguageConfigs,
    undefined,
    (_wasmPackage, wasmFile) => join(grammarDir, wasmFile),
  );
  await plugin.init();

  const supported = new Set(
    builtinLanguageConfigs.flatMap((config) =>
      config.extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`)),
    ),
  );

  const allFiles = walk(repoRoot, args.maxFiles);
  const codeFiles = allFiles.filter((file) => {
    const dot = file.lastIndexOf(".");
    return dot >= 0 && supported.has(file.slice(dot).toLowerCase());
  });

  const builder = new GraphBuilder(
    repoRoot.split("/").filter(Boolean).pop() ?? "repository",
    args.commitSha,
  );

  /** file path -> exported/defined symbol names, used to resolve call edges. */
  const analysed: {
    path: string;
    functions: string[];
    imports: { source: string }[];
    calls: { caller: string; callee: string }[];
  }[] = [];

  for (const absolute of codeFiles) {
    const path = relative(repoRoot, absolute);
    let content: string;
    try {
      content = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    // Minified bundles and generated lockfile-scale sources produce thousands
    // of meaningless nodes; they are structure without architecture.
    if (content.length > 400_000) continue;

    let full;
    try {
      full = plugin.analyzeFileFull(path, content);
    } catch {
      continue;
    }

    const { structure, callGraph } = full;
    if (
      structure.functions.length === 0 &&
      structure.classes.length === 0 &&
      structure.imports.length === 0
    ) {
      continue;
    }

    builder.addFileWithAnalysis(path, structure, {
      // Node prose is intentionally left empty here. Neo fills summaries
      // from the DeepWiki pages it already generated for this same commit
      // rather than prompting an LLM a second time — see deepwiki-bridge.ts.
      summary: "",
      fileSummary: "",
      summaries: {},
      tags: [],
      complexity:
        content.length > 40_000
          ? "complex"
          : content.length > 8_000
            ? "moderate"
            : "simple",
    });

    analysed.push({
      path,
      functions: structure.functions.map((fn) => fn.name),
      imports: structure.imports.map((imp) => ({ source: imp.source })),
      calls: callGraph.map((entry) => ({
        caller: entry.caller,
        callee: entry.callee,
      })),
    });
  }

  progress("relationships", { fileCount: analysed.length });

  // --- Relationships -------------------------------------------------------
  const byPath = new Map(analysed.map((file) => [file.path, file]));
  const functionOwner = new Map<string, string>();
  for (const file of analysed) {
    for (const name of file.functions) {
      // First definition wins; a duplicate name elsewhere is ambiguous and a
      // wrong edge is worse than a missing one.
      if (!functionOwner.has(name)) functionOwner.set(name, file.path);
    }
  }

  const resolveImport = (fromPath: string, source: string): string | null => {
    if (!source.startsWith(".")) return null;
    const fromDir = fromPath.includes("/")
      ? fromPath.slice(0, fromPath.lastIndexOf("/"))
      : "";
    const joined = resolvePath("/", fromDir, source).slice(1);
    const candidates = [
      joined,
      ...[".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"].flatMap(
        (ext) => [`${joined}${ext}`, `${joined}/index${ext}`],
      ),
    ];
    return candidates.find((candidate) => byPath.has(candidate)) ?? null;
  };

  for (const file of analysed) {
    for (const imp of file.imports) {
      const target = resolveImport(file.path, imp.source);
      if (target && target !== file.path)
        builder.addImportEdge(file.path, target);
    }
    for (const call of file.calls) {
      const calleeFile = functionOwner.get(call.callee);
      if (!calleeFile) continue;
      builder.addCallEdge(file.path, call.caller, calleeFile, call.callee);
    }
  }

  const graph: KnowledgeGraph = builder.build();
  graph.layers = detectLayers(graph);

  // --- Hierarchy -----------------------------------------------------------
  let hints: SubsystemHint[] = [];
  if (args.hints) {
    try {
      hints = JSON.parse(readFileSync(args.hints, "utf8")) as SubsystemHint[];
    } catch {
      // No DeepWiki hints available — subsystem naming falls back to detected
      // layers and then folders. Worth degrading rather than failing.
      hints = [];
    }
  }

  const hierarchy = buildHierarchy(graph, hints);

  progress("mapped", {
    fileCount: hierarchy.fileCount,
    symbolCount: hierarchy.symbolCount,
  });

  // --- Sharded output ------------------------------------------------------
  // Deliberately *not* one big file. The browser fetches `meta.json` plus the
  // root level to render the system view, then one shard per drill-down. A
  // combined index for a repo this size runs to megabytes, which would put a
  // multi-second download in front of the very first frame.
  const outDir = resolvePath(args.out);
  mkdirSync(join(outDir, "levels"), { recursive: true });

  const meta: CodeGraphMeta = {
    workspaceId: args.workspaceId,
    repositoryId: args.repositoryId,
    commitSha: args.commitSha,
    generatedAt: new Date().toISOString(),
    fileCount: hierarchy.fileCount,
    symbolCount: hierarchy.symbolCount,
    languages: graph.project.languages,
    frameworks: graph.project.frameworks,
  };

  for (const level of hierarchy.levels) {
    writeFileSync(
      join(outDir, "levels", `${shardName(level.parentId)}.json`),
      JSON.stringify({
        ...level,
        // Breadcrumbs travel with the shard so navigating straight to a deep
        // level never needs the full parent index client-side.
        crumbs: breadcrumbsFor(
          level.parentId,
          hierarchy.nodesById,
          hierarchy.parentById,
        ),
      }),
    );
  }

  // Compact search index: tuples, not objects, and only the fields search and
  // navigation need. Fetched lazily on the first search.
  const searchIndex = Object.values(hierarchy.nodesById).map((node) => [
    node.id,
    node.name,
    node.type,
    node.filePath ?? "",
    hierarchy.parentById[node.id] ?? "",
    node.level,
  ]);
  writeFileSync(join(outDir, "search.json"), JSON.stringify(searchIndex));

  writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta));

  progress("ready", {
    subsystemCount: hierarchy.childrenByParent[""]?.length ?? 0,
  });
}

main().catch((error: unknown) => {
  progress("failed", {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
