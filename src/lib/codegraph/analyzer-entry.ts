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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { relative, resolve as resolvePath, join } from "node:path";

import { GraphBuilder } from "../../../vendor/understand-anything/core/analyzer/graph-builder";
import { detectLayers } from "../../../vendor/understand-anything/core/analyzer/layer-detector";
import { TreeSitterPlugin } from "../../../vendor/understand-anything/core/plugins/tree-sitter-plugin";
import { builtinLanguageConfigs } from "../../../vendor/understand-anything/core/languages/configs/index";
import type { KnowledgeGraph } from "../../../vendor/understand-anything/core/types";

import {
  breadcrumbsFor,
  buildHierarchy,
  type SubsystemHint,
} from "./hierarchy";
import { resolveCalleeFile } from "./call-resolution";
import { shardName } from "./shard-name";
import { selectFilesToAnalyze } from "./file-selection";
import { walk } from "./repo-walk";
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

  // The raw walk needs a much larger cap than the analysis itself: it counts
  // every file it sees, including the non-code ones (assets, lockfiles, build
  // output) that `--max-files` was never meant to be spent on. Applying the
  // real cap to the *walk* let a repo with plenty of non-code files hit it
  // before reaching most of its actual source -- silently analysing an
  // arbitrary, walk-order-dependent slice of the codebase while reporting a
  // "complete" graph. The multiplier is just a safety valve against a
  // pathological tree; the cap that matters for analysis quality is applied
  // below, to the code files themselves, and is always reported when it binds.
  const WALK_SAFETY_MULTIPLIER = 20;
  const allFiles = walk(repoRoot, args.maxFiles * WALK_SAFETY_MULTIPLIER);
  const allCodeFiles = allFiles
    .filter((file) => {
      const dot = file.lastIndexOf(".");
      return dot >= 0 && supported.has(file.slice(dot).toLowerCase());
    })
    // `walk()`'s traversal order follows `readdirSync`, which is filesystem-
    // and OS-dependent, not stable across sandboxes. Sorting makes
    // `functionOwner`'s "first definition wins" tie-break (below) — and the
    // graph itself — deterministic for the same commit.
    .sort();
  const fileSelection = selectFilesToAnalyze(allCodeFiles, args.maxFiles);
  const codeFiles = fileSelection.selected;

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
      // Prefer the calling file's own definition over the ambiguous
      // cross-file map -- see call-resolution.ts.
      const calleeFile = resolveCalleeFile(
        file.path,
        call.callee,
        file.functions,
        functionOwner,
      );
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
    ...(fileSelection.reducedAnalysis
      ? {
          reducedAnalysis: true,
          skippedFileCount: fileSelection.skippedFileCount,
        }
      : {}),
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
