import { GEMINI_API_BASE, GEMINI_API_KEY, GEMINI_MODEL } from "@/env";
import {
  buildRepoEvidenceBundle,
  buildSceneSourceRefs,
  getCodeExcerptForRef,
  getRelatedFilesForFile,
  humanizeFileLabel,
  isConfigFile,
  isDocFile,
  isSourceCodeFile,
  isTestFile,
} from "@/lib/repoEvidence";
import {
  buildRepoKnowledgeGraph,
  getContextFilesForCapsule,
  getContextSummaryForCapsule,
  getTutorialCapsules,
} from "@/lib/repoKnowledgeGraph";
import {
  discoverRepoVideoModules,
  MASTER_VIDEO_TARGET_RANGE_LABEL,
  MODULE_VIDEO_TARGET_RANGE_LABEL,
} from "@/lib/videoWorkspace";
import type {
  GitNexusGraphData,
  QualityReport,
  RepoKnowledgeGraph,
  RepoVideoModule,
  RepoVideoModuleCatalog,
  SentenceEvidence,
  SourceRef,
  TutorialPhase,
  VideoManifest,
  VideoScene,
  VideoSceneDiagram,
  VideoVisualKind,
} from "@/lib/types";

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

interface SceneSpec {
  id: number;
  phase: TutorialPhase;
  type: VideoScene["type"];
  title: string;
  sceneGoal: string;
  filePath: string;
  lineRange: [number, number];
  visualKind: VideoVisualKind;
  claim: string;
  evidenceRefs: SourceRef[];
  diagramSpec?: VideoSceneDiagram;
  repoMapPaths?: string[];
  onScreenFocus: string[];
  bulletPoints: string[];
  focusSymbols: string[];
  durationSeconds: number;
  generationKind?: "master" | "module";
  moduleTitle?: string;
  narrationWordTarget?: [number, number];
}

type ConceptKind =
  | "hook"
  | "repo_map"
  | "architecture"
  | "flow"
  | "module"
  | "operations"
  | "conclusion";

interface ConceptBrief {
  id: string;
  kind: ConceptKind;
  phase: TutorialPhase;
  title: string;
  summary: string;
  viewerGoal: string;
  primaryFiles: string[];
  supportingFiles: string[];
  importance: number;
  clusterId?: string;
  processId?: string;
}

interface ConceptEvidencePack {
  concept: ConceptBrief;
  filePath: string;
  evidenceRefs: SourceRef[];
  repoMapPaths?: string[];
  diagramSpec?: VideoSceneDiagram;
  bulletPoints: string[];
  focusSymbols: string[];
  onScreenFocus: string[];
}

interface ConceptPlan {
  title?: string;
  concept_order?: string[];
  concept_adjustments?: Array<{
    id: string;
    title?: string;
    teaching_goal?: string;
    plain_english_focus?: string;
  }>;
}

interface SceneWriterResponse {
  title?: string;
  claim?: string;
  sentences?: Array<{
    text: string;
    evidence_indexes: number[];
    on_screen_focus?: string[];
  }>;
}

export interface VideoGenerationOptions {
  kind?: "master" | "module";
  module?: RepoVideoModule | null;
  moduleCatalog?: RepoVideoModuleCatalog | null;
  targetDurationSeconds?: number;
  targetDurationLabel?: string;
}

const GENERIC_PHRASES = [
  "this file handles",
  "this module handles",
  "important logic",
  "key component",
  "glue code",
  "various features",
  "different things",
  "ties everything together",
];

const WORDS_PER_SECOND = 2.3;

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );

const countWords = (text: string | null | undefined) =>
  text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

const stripMarkdownFence = (value: string) => {
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
};

const parseGeminiJson = <T,>(raw: string): T => {
  const text = stripMarkdownFence(raw.trim());

  try {
    return JSON.parse(text) as T;
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]) as T;
    }
    throw new Error("Could not parse JSON from Gemini response");
  }
};

const sanitizeNarration = (text: string) => {
  let cleaned = text;

  cleaned = cleaned.replace(
    /(?:`)?(?:\.\/)?(?:[\w.-]+\/)+(\w[\w.-]*)(?:\.\w{1,5})(?:`)?/g,
    (_match, filename: string) => {
      const humanName = filename
        .replace(/[_-]+/g, " ")
        .replace(/\.[^/.]+$/, "")
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
      return `the ${humanName} module`;
    }
  );

  cleaned = cleaned.replace(/`/g, "");
  cleaned = cleaned.replace(/\\/g, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const estimateDuration = (sentences: string[], fallbackSeconds = 14) => {
  const words = sentences.reduce((sum, sentence) => sum + countWords(sentence), 0);
  const speechDuration = words > 0 ? Math.ceil(words / WORDS_PER_SECOND) + 3 : 0;
  return Math.max(fallbackSeconds, speechDuration);
};

const getTargetVideoDurationSeconds = (
  evidence: ReturnType<typeof buildRepoEvidenceBundle>
) => {
  const complexityScore =
    evidence.source_files.length * 4 +
    evidence.cluster_summaries.length * 14 +
    evidence.process_flows.length * 18 +
    evidence.hub_files.length * 6;
  return clamp(170 + complexityScore, 210, 420);
};

const stretchScenePlanToTarget = (
  scenePlan: SceneSpec[],
  targetSeconds: number
) => {
  const currentSeconds = scenePlan.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0
  );

  if (currentSeconds >= targetSeconds || scenePlan.length === 0) {
    return scenePlan;
  }

  const shortfall = targetSeconds - currentSeconds;
  const weighted = scenePlan.map((scene) => {
    const phaseWeight =
      scene.phase === "hook"
        ? 1.35
        : scene.phase === "architecture"
          ? 1.2
          : scene.phase === "flow"
            ? 1.3
            : scene.phase === "deep_dive"
              ? 1.25
              : scene.phase === "details"
                ? 0.9
                : 1.0;
    const evidenceWeight = Math.max(1, scene.evidenceRefs.length * 0.35);
    return phaseWeight + evidenceWeight;
  });
  const totalWeight = weighted.reduce((sum, value) => sum + value, 0);

  return scenePlan.map((scene, index) => {
    const addition = Math.max(
      2,
      Math.round((weighted[index] / totalWeight) * shortfall)
    );
    return {
      ...scene,
      durationSeconds: scene.durationSeconds + addition,
    };
  });
};

const buildScopedFileContents = (
  fileContents: Record<string, string>,
  module?: RepoVideoModule | null
) => {
  if (!module) return fileContents;

  const scopedPaths = uniqueStrings([
    ...module.file_paths,
    ...module.related_file_paths,
  ]).filter((filePath) => fileContents[filePath]);

  if (scopedPaths.length === 0) {
    return fileContents;
  }

  return Object.fromEntries(
    scopedPaths.map((filePath) => [filePath, fileContents[filePath]])
  );
};

const expandConceptsForGeneration = (
  concepts: ConceptBrief[],
  fileContents: Record<string, string>,
  graphData: GitNexusGraphData | null | undefined,
  kind: "master" | "module"
) => {
  const expanded: ConceptBrief[] = [];
  const seenKeys = new Set<string>();
  const maxDetailScenes = kind === "master" ? 8 : 4;
  let addedDetails = 0;

  const pushConcept = (concept: ConceptBrief) => {
    const primaryKey = `${concept.id}:${concept.primaryFiles[0] || concept.title}`;
    if (seenKeys.has(primaryKey)) return;
    seenKeys.add(primaryKey);
    expanded.push(concept);
  };

  concepts.forEach((concept) => {
    pushConcept(concept);

    if (
      addedDetails >= maxDetailScenes ||
      concept.kind === "hook" ||
      concept.kind === "repo_map" ||
      concept.kind === "conclusion"
    ) {
      return;
    }

    const detailCandidates = uniqueStrings([
      ...concept.supportingFiles,
      ...concept.primaryFiles.flatMap((filePath) =>
        getRelatedFilesForFile(
          graphData,
          filePath,
          Object.keys(fileContents),
          kind === "master" ? 3 : 2
        )
      ),
    ]).filter(
      (filePath) =>
        fileContents[filePath] &&
        !concept.primaryFiles.includes(filePath) &&
        !concept.supportingFiles.includes(filePath)
    );

    const perConceptLimit = kind === "master" ? 2 : 1;
    detailCandidates.slice(0, perConceptLimit).forEach((filePath, index) => {
      if (addedDetails >= maxDetailScenes) return;
      const detailConcept: ConceptBrief = {
        ...concept,
        id: `${concept.id}-detail-${index + 1}`,
        title: `${concept.title}: ${humanizeFileLabel(filePath)}`,
        summary: `Zoom into ${humanizeFileLabel(filePath)} to make the ${concept.title.toLowerCase()} story concrete and code-backed.`,
        viewerGoal: `Use ${humanizeFileLabel(filePath)} to show the implementation detail behind ${concept.title.toLowerCase()}.`,
        primaryFiles: [filePath],
        supportingFiles: getRelatedFilesForFile(
          graphData,
          filePath,
          Object.keys(fileContents),
          kind === "master" ? 4 : 3
        ),
        importance: clamp(concept.importance - 6 - addedDetails, 18, 96),
      };
      pushConcept(detailConcept);
      addedDetails += 1;
    });
  });

  return expanded;
};

const requestGemini = async (prompt: string, temperature = 0.25) => {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          topK: 32,
          topP: 0.9,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response from Gemini API");
  }
  return text;
};

const buildArchitectureDiagram = (sceneSpecs: SceneSpec[]) => {
  const architectural = sceneSpecs.filter(
    (scene) => scene.phase === "architecture" && scene.visualKind !== "diagram"
  );
  if (architectural.length < 2) return null;

  const lines = ["flowchart LR"];
  architectural.slice(0, 4).forEach((scene, index) => {
    lines.push(`A${index}["${scene.title.replace(/"/g, "'")}"]`);
    if (index > 0) {
      lines.push(`A${index - 1} --> A${index}`);
    }
  });

  return {
    mermaid: lines.join("\n"),
    caption: "How the main repository layers relate to one another",
    kind: "architecture" as const,
  };
};

const buildRepoMapPaths = (
  repoFiles: string[],
  selectedFiles: string[]
) => {
  const rootFolders = uniqueStrings(
    repoFiles
      .map((filePath) => filePath.split("/").slice(0, 2).join("/"))
      .filter(Boolean)
  );

  return uniqueStrings([...selectedFiles, ...rootFolders]).slice(0, 10);
};

const buildIntroBullets = (
  repoName: string,
  opener: { file_path: string; score: number; reasons: string[] },
  architecture: string | undefined,
  technologies: string[]
) => [
  `${humanizeFileLabel(opener.file_path)} is the strongest real-code anchor for explaining ${repoName}.`,
  opener.reasons[0]
    ? `It ranks highly because it ${opener.reasons[0]}.`
    : `It is a strong opening because it contains executable source code.`,
  architecture
    ? `The graph points to a ${architecture} architecture.`
    : `The opening should explain the product outcome before the implementation details.`,
  technologies.length > 0
    ? `The main stack includes ${technologies.slice(0, 3).join(", ")}.`
    : `The walkthrough should stay grounded in the actual code on screen.`,
];

const extractHighLevelConcepts = (
  repoName: string,
  evidence: ReturnType<typeof buildRepoEvidenceBundle>,
  fileContents: Record<string, string>,
  knowledgeGraph: RepoKnowledgeGraph,
  graphData?: GitNexusGraphData | null
) => {
  const repoFiles = evidence.repo_tree;
  const opener =
    evidence.opener_candidates[0] ||
    (evidence.source_files[0]
      ? { file_path: evidence.source_files[0], score: 40, reasons: ["contains executable source code"] }
      : { file_path: repoFiles[0], score: 1, reasons: ["is the only available file"] });
  const technologies = evidence.repo_stats?.key_technologies ?? [];
  const architecture = evidence.repo_stats?.architecture_pattern;
  const capsules = getTutorialCapsules(knowledgeGraph);
  const concepts: ConceptBrief[] = capsules.map((capsule, index) => {
    const contextualFiles = getContextFilesForCapsule(knowledgeGraph, capsule, 6);
    const primaryFiles = uniqueStrings([
      ...capsule.file_paths,
      ...contextualFiles,
    ]).filter((filePath) => filePath && fileContents[filePath]);
    const supportingFiles = uniqueStrings([
      ...contextualFiles,
      ...primaryFiles.flatMap((filePath) =>
        getRelatedFilesForFile(graphData, filePath, repoFiles, capsule.purpose === "flow" ? 5 : 3)
      ),
    ])
      .filter((filePath) => filePath && fileContents[filePath])
      .slice(0, capsule.purpose === "flow" ? 6 : 4);

    return {
      id: `concept-${capsule.id}`,
      kind: capsule.purpose,
      phase: capsule.phase,
      title: capsule.title,
      summary: getContextSummaryForCapsule(knowledgeGraph, capsule),
      viewerGoal: capsule.teaching_goal,
      primaryFiles,
      supportingFiles,
      importance: clamp(capsule.importance - index, 10, 100),
      clusterId: capsule.cluster_id,
      processId: capsule.process_id,
    };
  });

  if (concepts.length === 0) {
    concepts.push({
      id: "concept-hook-fallback",
      kind: "hook",
      phase: "hook",
      title: `Start Here: ${humanizeFileLabel(opener.file_path)}`,
      summary: `${repoName} reveals its main responsibility most clearly in ${humanizeFileLabel(opener.file_path)}.`,
      viewerGoal: "Open on a strong source file and explain the product outcome in plain English.",
      primaryFiles: [opener.file_path],
      supportingFiles: getRelatedFilesForFile(graphData, opener.file_path, repoFiles, 3),
      importance: 100,
    });
  }

  return {
    opener,
    technologies,
    architecture,
    concepts,
  };
};

const orderConcepts = async (
  repoName: string,
  concepts: ConceptBrief[],
  architecture: string | undefined,
  kind: "master" | "module" = "master",
  moduleTitle?: string
) => {
  if (!GEMINI_API_KEY) {
    return {
      title: `${repoName} - Repository Walkthrough`,
      concepts,
    };
  }

  const prompt = `You are planning the teaching arc for a repository walkthrough video.

Repository: ${repoName}
Architecture hint: ${architecture || "Unknown"}
Video kind: ${kind === "module" ? `Focused module walkthrough for ${moduleTitle || "the selected module"}` : "Master walkthrough across the full repository"}

Rules:
- You are only seeing high-level concept summaries, not full code.
- You may reorder concepts, improve titles, and improve teaching goals.
- Keep the hook first and the conclusion last.
- If this is a module walkthrough, keep the story tightly focused on one subsystem instead of broad repo coverage.
- If this is a master walkthrough, make the flow feel expansive and documentary, not brief.
- Return JSON only.

Schema:
{
  "title": "string",
  "concept_order": ["concept-hook", "concept-repo-map"],
  "concept_adjustments": [
    {
      "id": "concept-hook",
      "title": "string",
      "teaching_goal": "string",
      "plain_english_focus": "string"
    }
  ]
}

Concepts:
${JSON.stringify(
    concepts.map((concept) => ({
      id: concept.id,
      kind: concept.kind,
      phase: concept.phase,
      title: concept.title,
      summary: concept.summary,
      viewer_goal: concept.viewerGoal,
      primary_files: concept.primaryFiles.map(humanizeFileLabel),
    })),
    null,
    2
  )}`;

  try {
    const raw = await requestGemini(prompt, 0.2);
    const parsed = parseGeminiJson<ConceptPlan>(raw);
    const conceptMap = new Map(concepts.map((concept) => [concept.id, concept] as const));
    const first = concepts.find((concept) => concept.kind === "hook");
    const last = concepts.find((concept) => concept.kind === "conclusion");
    const middle = (parsed.concept_order || [])
      .map((id) => conceptMap.get(id))
      .filter((concept): concept is ConceptBrief => Boolean(concept))
      .filter((concept) => concept.kind !== "hook" && concept.kind !== "conclusion");

    const untouched = concepts.filter(
      (concept) =>
        concept.kind !== "hook" &&
        concept.kind !== "conclusion" &&
        !middle.some((ordered) => ordered.id === concept.id)
    );

    const adjustmentById = new Map(
      (parsed.concept_adjustments || []).map((concept) => [concept.id, concept] as const)
    );

    const ordered = [
      ...(first ? [first] : []),
      ...middle,
      ...untouched.sort((a, b) => b.importance - a.importance),
      ...(last ? [last] : []),
    ].map((concept) => {
      const adjustment = adjustmentById.get(concept.id);
      if (!adjustment) return concept;
      return {
        ...concept,
        title: adjustment.title?.trim()
          ? sanitizeNarration(adjustment.title.trim())
          : concept.title,
        viewerGoal: adjustment.teaching_goal?.trim()
          ? sanitizeNarration(adjustment.teaching_goal.trim())
          : concept.viewerGoal,
        summary: adjustment.plain_english_focus?.trim()
          ? sanitizeNarration(adjustment.plain_english_focus.trim())
          : concept.summary,
      };
    });

    return {
      title: parsed.title?.trim()
        ? sanitizeNarration(parsed.title.trim())
        : `${repoName} - Repository Walkthrough`,
      concepts: ordered,
    };
  } catch (error) {
    console.warn("Concept planner failed; using deterministic concept order.", error);
    return {
      title: `${repoName} - Repository Walkthrough`,
      concepts,
    };
  }
};

const buildConceptEvidencePack = (
  repoName: string,
  concept: ConceptBrief,
  evidence: ReturnType<typeof buildRepoEvidenceBundle>,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null
): ConceptEvidencePack => {
  const repoFiles = evidence.repo_tree;
  const primaryFile = concept.primaryFiles.find((filePath) => fileContents[filePath]) || concept.primaryFiles[0];
  const relatedFiles = uniqueStrings([
    ...concept.primaryFiles,
    ...concept.supportingFiles,
    ...concept.primaryFiles.flatMap((filePath) =>
      getRelatedFilesForFile(graphData, filePath, repoFiles, concept.kind === "module" ? 4 : 2)
    ),
  ]).filter((filePath) => filePath && fileContents[filePath]);

  const evidenceRefs = buildSceneSourceRefs(
    relatedFiles.slice(0, concept.kind === "flow" ? 6 : 4),
    evidence,
    fileContents,
    graphData,
    concept.title
  );
  const repoMapPaths =
    concept.kind === "repo_map" || concept.kind === "conclusion"
      ? buildRepoMapPaths(repoFiles, relatedFiles)
      : undefined;

  let diagramSpec: VideoSceneDiagram | undefined;
  if (concept.kind === "architecture") {
    diagramSpec = buildArchitectureDiagram(
      evidence.cluster_summaries.slice(0, 4).map((cluster, index) => ({
        id: index,
        phase: "architecture",
        type: "overview",
        title: cluster.label,
        sceneGoal: concept.viewerGoal,
        filePath: cluster.representative_file || primaryFile,
        lineRange: [1, 1],
        visualKind: "repo-map",
        claim: cluster.description || cluster.label,
        evidenceRefs: [],
        onScreenFocus: [],
        bulletPoints: [],
        focusSymbols: [],
        durationSeconds: 0,
      }))
    ) || undefined;
  } else if (concept.kind === "flow") {
    const flow = evidence.process_flows.find((process) => process.id === concept.processId) || evidence.process_flows[0];
    if (flow) {
      diagramSpec = {
        mermaid: flow.mermaid || "flowchart LR\nA[Entry] --> B[Processing]",
        caption: flow.description || "Primary graph-derived execution flow",
        kind: "flow",
      };
    }
  }

  const focusSymbols = evidenceRefs
    .map((ref) => ref.symbol_name)
    .filter(Boolean) as string[];
  const onScreenFocus = uniqueStrings([
    concept.title,
    ...focusSymbols,
    ...relatedFiles.slice(0, 4).map(humanizeFileLabel),
  ]).slice(0, 6);

  const bulletPoints =
    concept.kind === "hook"
      ? buildIntroBullets(
          repoName,
          { file_path: primaryFile, score: 0, reasons: ["was ranked as the strongest opening anchor"] },
          evidence.repo_stats?.architecture_pattern,
          evidence.repo_stats?.key_technologies || []
        )
      : [
          concept.summary,
          concept.viewerGoal,
          relatedFiles.length > 1
            ? `This concept connects ${relatedFiles.slice(0, 3).map(humanizeFileLabel).join(", ")}.`
            : `The highlighted lines are the evidence for this concept.`,
          concept.kind === "flow"
            ? `Each step comes from the graph-derived execution path, not a guessed walkthrough.`
            : `The visual should stay attached to the retrieved evidence for this concept only.`,
        ];

  return {
    concept,
    filePath: primaryFile,
    evidenceRefs,
    repoMapPaths,
    diagramSpec,
    bulletPoints,
    focusSymbols,
    onScreenFocus,
  };
};

const buildScenePlan = (
  repoName: string,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null
) => {
  const evidence = buildRepoEvidenceBundle(repoName, fileContents, graphData);
  const knowledgeGraph = buildRepoKnowledgeGraph(
    repoName,
    evidence,
    fileContents,
    graphData
  );
  const { concepts } = extractHighLevelConcepts(
    repoName,
    evidence,
    fileContents,
    knowledgeGraph,
    graphData
  );
  const scenes: SceneSpec[] = [];
  let sceneId = 1;

  concepts
    .sort((a, b) => b.importance - a.importance)
    .forEach((concept) => {
      const pack = buildConceptEvidencePack(repoName, concept, evidence, fileContents, graphData);
      const primaryRef = pack.evidenceRefs[0];
      const type: VideoScene["type"] =
        concept.kind === "hook"
          ? "intro"
          : concept.kind === "repo_map" || concept.kind === "architecture" || concept.kind === "flow"
            ? "overview"
            : concept.kind === "operations"
              ? "support"
              : concept.kind === "conclusion"
                ? "outro"
                : evidence.entry_candidates.includes(pack.filePath)
                  ? "entry"
                  : evidence.hub_files.includes(pack.filePath)
                    ? "core"
                    : "feature";
      const visualKind: VideoVisualKind =
        concept.kind === "repo_map" || concept.kind === "conclusion"
          ? "repo-map"
          : concept.kind === "architecture" || concept.kind === "flow"
            ? "diagram"
            : "code";

      scenes.push({
        id: sceneId++,
        phase: concept.phase,
        type,
        title: concept.title,
        sceneGoal: concept.viewerGoal,
        filePath: pack.filePath,
        lineRange: primaryRef
          ? [primaryRef.start_line, primaryRef.end_line]
          : [1, 24],
        visualKind,
        claim: concept.summary,
        evidenceRefs: pack.evidenceRefs,
        diagramSpec: pack.diagramSpec,
        repoMapPaths: pack.repoMapPaths,
        onScreenFocus: pack.onScreenFocus,
        bulletPoints: pack.bulletPoints,
        focusSymbols: pack.focusSymbols,
        durationSeconds:
          concept.kind === "hook" || concept.kind === "flow"
            ? 18
            : concept.kind === "architecture" || concept.kind === "repo_map" || concept.kind === "conclusion"
              ? 16
              : concept.kind === "operations"
                ? 15
                : 18,
      });
    });

  return {
    evidence,
    knowledgeGraph,
    scenes: stretchScenePlanToTarget(
      scenes,
      getTargetVideoDurationSeconds(evidence)
    ),
    concepts,
  };
};

const buildSceneWriterPrompt = (
  repoName: string,
  scene: SceneSpec,
  evidencePack: Array<{ index: number; ref: SourceRef; excerpt: string }>
) => `You are writing ONE scene of a repository tutorial video.

Repository: ${repoName}
Scene title: ${scene.title}
Phase: ${scene.phase}
Scene goal: ${scene.sceneGoal}
Visual kind: ${scene.visualKind}
Claim: ${scene.claim}
Video profile: ${
  scene.generationKind === "module"
    ? `Focused module walkthrough${scene.moduleTitle ? ` for ${scene.moduleTitle}` : ""}`
    : "Long-form master walkthrough"
}

Rules:
- Write 4 to 6 spoken sentences.
- Sound natural for text-to-speech.
- Explain the why before the syntax.
- Do not mention file paths, slashes, or raw directory names.
- Every sentence must cite one or more evidence indexes from the list below.
- Do not invent behavior not supported by the evidence.
- Aim for roughly ${scene.narrationWordTarget?.[0] || 90} to ${
  scene.narrationWordTarget?.[1] || 150
} spoken words.
- Let the narration breathe. This product prefers slower, more complete explanations over compressed one-shot summaries.
- Return JSON only.

Schema:
{
  "title": "string",
  "claim": "string",
  "sentences": [
    {
      "text": "string",
      "evidence_indexes": [0],
      "on_screen_focus": ["string"]
    }
  ]
}

Scene evidence:
${JSON.stringify(
  evidencePack.map((item) => ({
    index: item.index,
    file_path: item.ref.file_path,
    start_line: item.ref.start_line,
    end_line: item.ref.end_line,
    symbol_name: item.ref.symbol_name,
    reason: item.ref.reason,
    excerpt: item.excerpt,
  })),
  null,
  2
)}`;

const buildScriptEditorPrompt = (
  repoName: string,
  scene: SceneSpec,
  draft: SceneWriterResponse
) => `You are editing one scene of a repository tutorial script.

Repository: ${repoName}
Scene: ${scene.title}
Goal: ${scene.sceneGoal}
Visual kind: ${scene.visualKind}

Rules:
- Improve clarity, pacing, and layman-friendliness.
- Preserve the same number of sentences.
- Keep each sentence attached to the same evidence indexes.
- Do not add claims.
- Do not mention file paths.
- Return JSON only.

Current draft:
${JSON.stringify(draft, null, 2)}`;

const fallbackSceneWriter = (scene: SceneSpec): SceneWriterResponse => {
  const sentences = [
    scene.claim,
    ...scene.bulletPoints.slice(0, 2),
    scene.sceneGoal,
  ]
    .map((sentence) => sanitizeNarration(sentence))
    .filter(Boolean)
    .slice(0, 5)
    .map((text, index) => ({
      text,
      evidence_indexes: [clamp(index, 0, Math.max(0, scene.evidenceRefs.length - 1))],
      on_screen_focus: scene.onScreenFocus.slice(0, 3),
    }));

  return {
    title: scene.title,
    claim: scene.claim,
    sentences,
  };
};

const writeScene = async (
  repoName: string,
  scene: SceneSpec,
  fileContents: Record<string, string>
) => {
  if (!GEMINI_API_KEY) {
    return fallbackSceneWriter(scene);
  }

  const evidencePack = scene.evidenceRefs.map((ref, index) => ({
    index,
    ref,
    excerpt: getCodeExcerptForRef(fileContents, ref),
  }));

  try {
    const raw = await requestGemini(buildSceneWriterPrompt(repoName, scene, evidencePack), 0.3);
    const parsed = parseGeminiJson<SceneWriterResponse>(raw);
    if (!parsed.sentences?.length) {
      throw new Error("Scene writer returned no sentences");
    }
    return parsed;
  } catch (error) {
    console.warn(`Scene writer failed for ${scene.title}; using deterministic fallback.`, error);
    return fallbackSceneWriter(scene);
  }
};

const editScene = async (
  repoName: string,
  scene: SceneSpec,
  draft: SceneWriterResponse
) => {
  if (!GEMINI_API_KEY) {
    return draft;
  }

  try {
    const raw = await requestGemini(buildScriptEditorPrompt(repoName, scene, draft), 0.2);
    const parsed = parseGeminiJson<SceneWriterResponse>(raw);
    if (
      !parsed.sentences?.length ||
      parsed.sentences.length !== draft.sentences?.length
    ) {
      return draft;
    }
    return parsed;
  } catch (error) {
    console.warn(`Script editor failed for ${scene.title}; keeping writer draft.`, error);
    return draft;
  }
};

const buildSentenceEvidence = (
  scene: SceneSpec,
  response: SceneWriterResponse
): SentenceEvidence[] => {
  const sourceCount = scene.evidenceRefs.length;
  const fallbackRef = scene.evidenceRefs[0];

  return (response.sentences ?? [])
    .map((sentence) => {
      const refs = uniqueStrings(
        (sentence.evidence_indexes ?? []).map((index) =>
          Number.isFinite(index) && sourceCount > 0
            ? String(clamp(index, 0, sourceCount - 1))
            : null
        )
      )
        .map((index) => scene.evidenceRefs[Number(index)])
        .filter(Boolean);

      return {
        sentence: sanitizeNarration(sentence.text || ""),
        claim: response.claim || scene.claim,
        source_refs: refs.length > 0 ? refs : fallbackRef ? [fallbackRef] : [],
        visual_kind: scene.visualKind,
        on_screen_focus:
          sentence.on_screen_focus?.length
            ? sentence.on_screen_focus
            : scene.onScreenFocus.slice(0, 3),
      } as SentenceEvidence;
    })
    .filter((sentence) => sentence.sentence && sentence.source_refs.length > 0);
};

const finalizeScene = (
  scene: SceneSpec,
  response: SceneWriterResponse,
  fileContents: Record<string, string>
): VideoScene => {
  const sentenceEvidence = buildSentenceEvidence(scene, response);
  const usableSentenceEvidence =
    sentenceEvidence.length > 0
      ? sentenceEvidence
      : buildSentenceEvidence(scene, fallbackSceneWriter(scene));

  const primaryRef = usableSentenceEvidence[0]?.source_refs[0] || scene.evidenceRefs[0];
  const narration = usableSentenceEvidence.map((sentence) => sentence.sentence).join(" ");
  const duration = estimateDuration(
    usableSentenceEvidence.map((sentence) => sentence.sentence),
    scene.durationSeconds
  );
  const code = primaryRef ? fileContents[primaryRef.file_path] || "" : fileContents[scene.filePath] || "";
  const hasRealCode = code.trim().length > 0;
  const genericLanguageCount = GENERIC_PHRASES.reduce(
    (count, phrase) => count + (narration.toLowerCase().includes(phrase) ? 1 : 0),
    0
  );

  return {
    id: scene.id,
    type: scene.type,
    file_path: primaryRef?.file_path || scene.filePath,
    highlight_lines: primaryRef
      ? [primaryRef.start_line, primaryRef.end_line]
      : scene.lineRange,
    narration_text: narration,
    duration_seconds: duration,
    title: sanitizeNarration(response.title || scene.title),
    code,
    phase: scene.phase,
    visual_type: scene.visualKind,
    visual_kind: scene.visualKind,
    bullet_points: scene.bulletPoints,
    focus_symbols: scene.focusSymbols,
    diagram: scene.diagramSpec,
    source_refs: scene.evidenceRefs,
    claim: response.claim || scene.claim,
    on_screen_focus: scene.onScreenFocus,
    sentence_evidence: usableSentenceEvidence,
    quality_flags: {
      has_real_code: hasRealCode,
      has_source_refs: scene.evidenceRefs.length > 0,
      has_sentence_evidence: usableSentenceEvidence.length > 0,
      visual_sync_ready: usableSentenceEvidence.every((sentence) => sentence.source_refs.length > 0),
      placeholder_visual: !hasRealCode && scene.visualKind === "code",
      opener_eligible: scene.phase !== "hook" || isSourceCodeFile(scene.filePath),
      repo_noise:
        scene.phase === "hook"
          ? isDocFile(scene.filePath) || isConfigFile(scene.filePath) || isTestFile(scene.filePath)
          : false,
      generic_language_count: genericLanguageCount,
    },
    repo_map_paths: scene.repoMapPaths,
  };
};

const validateScene = (
  scene: VideoScene,
  fileContents: Record<string, string>,
  hasSourceFiles: boolean
) => {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const sourceRefs = scene.source_refs ?? [];
  const sentenceEvidence = scene.sentence_evidence ?? [];

  if (scene.phase === "hook" && hasSourceFiles && !isSourceCodeFile(scene.file_path)) {
    blockers.push("Opener is not using a real source file.");
  }

  if (sourceRefs.length === 0) {
    blockers.push("Scene is missing source refs.");
  }

  if (sentenceEvidence.length === 0) {
    blockers.push("Scene has no sentence-level evidence.");
  }

  if (
    scene.visual_kind === "code" &&
    !(scene.code || "").trim().length
  ) {
    blockers.push("Code scene resolved to empty visual content.");
  }

  sentenceEvidence.forEach((sentence) => {
    if (!sentence.source_refs?.length) {
      blockers.push("A narration sentence is missing evidence.");
      return;
    }
    sentence.source_refs.forEach((ref) => {
      const content = fileContents[ref.file_path];
      const totalLines = content ? content.split(/\r?\n/).length : 0;
      if (!content) {
        blockers.push(`Missing source file for evidence: ${ref.file_path}`);
      } else if (ref.start_line < 1 || ref.end_line > totalLines || ref.end_line < ref.start_line) {
        blockers.push(`Invalid line range for evidence: ${ref.file_path}:${ref.start_line}-${ref.end_line}`);
      }
    });
  });

  const genericCount = scene.quality_flags?.generic_language_count ?? 0;
  if (genericCount > 1) {
    warnings.push("Scene narration still contains generic language.");
  }

  return { blockers, warnings };
};

export const buildQualityReport = (
  manifest: VideoManifest,
  fileContents: Record<string, string>
): QualityReport => {
  const scenes = manifest.scenes || [];
  const hasSourceFiles = Object.keys(fileContents).some(isSourceCodeFile);
  const blockers: string[] = [];
  const warnings: string[] = [];

  const sceneReports = scenes.map((scene) => {
    const sceneValidation = validateScene(scene, fileContents, hasSourceFiles);
    blockers.push(...sceneValidation.blockers);
    warnings.push(...sceneValidation.warnings);

    const evidenceCoverage =
      scene.sentence_evidence?.length
        ? scene.sentence_evidence.filter((sentence) => sentence.source_refs?.length).length /
          scene.sentence_evidence.length
        : 0;

    const visualSync =
      scene.sentence_evidence?.length
        ? scene.sentence_evidence.every((sentence) => sentence.source_refs?.length) ? 1 : 0
        : 0;

    return {
      scene_id: scene.id,
      title: scene.title,
      blockers: sceneValidation.blockers,
      warnings: sceneValidation.warnings,
      evidence_coverage: evidenceCoverage,
      visual_sync: visualSync,
    };
  });

  const opener = scenes[0];
  const openerQuality = opener
    ? opener.phase === "hook" &&
      opener.visual_kind === "code" &&
      hasSourceFiles &&
      isSourceCodeFile(opener.file_path)
      ? 1
      : 0
    : 0;

  const evidenceCoverage =
    sceneReports.length > 0
      ? sceneReports.reduce((sum, report) => sum + report.evidence_coverage, 0) / sceneReports.length
      : 0;

  const visualSync =
    sceneReports.length > 0
      ? sceneReports.reduce((sum, report) => sum + report.visual_sync, 0) / sceneReports.length
      : 0;

  const genericLanguageCount = scenes.reduce(
    (sum, scene) => sum + (scene.quality_flags?.generic_language_count ?? 0),
    0
  );

  const repoNoiseCount = scenes.filter((scene) => {
    if (scene.phase !== "hook") return false;
    return isDocFile(scene.file_path) || isConfigFile(scene.file_path) || isTestFile(scene.file_path);
  }).length;

  const pathTokens = scenes.reduce((sum, scene) => {
    const matches = scene.narration_text.match(/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+/g);
    return sum + (matches?.length ?? 0);
  }, 0);

  const averageSentenceLength = (() => {
    const sentences = scenes.flatMap((scene) =>
      (scene.sentence_evidence ?? []).map((sentence) => countWords(sentence.sentence))
    );
    if (sentences.length === 0) return 0;
    return sentences.reduce((sum, count) => sum + count, 0) / sentences.length;
  })();

  const laymanReadability = averageSentenceLength === 0
    ? 0
    : clamp(1 - Math.abs(averageSentenceLength - 18) / 18 - pathTokens * 0.02, 0, 1);

  if (opener && hasSourceFiles && !isSourceCodeFile(opener.file_path)) {
    blockers.push("Opener uses docs/config/tests even though source files exist.");
  }

  scenes.forEach((scene) => {
    if ((scene.source_refs ?? []).length === 0) {
      blockers.push(`Scene ${scene.id} is missing source refs.`);
    }
    if ((scene.sentence_evidence ?? []).some((sentence) => !sentence.source_refs?.length)) {
      blockers.push(`Scene ${scene.id} has narration without evidence.`);
    }
    if (
      scene.visual_kind === "code" &&
      !(scene.code || "").trim().length
    ) {
      blockers.push(`Scene ${scene.id} resolved to empty code.`);
    }
  });

  return {
    pipeline_version: manifest.pipeline_version || "v2",
    ready_for_tts: blockers.length === 0,
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    scores: {
      opener_quality: openerQuality,
      evidence_coverage: Number(evidenceCoverage.toFixed(2)),
      generic_language_count: genericLanguageCount,
      visual_sync: Number(visualSync.toFixed(2)),
      repo_noise: repoNoiseCount,
      layman_readability: Number(laymanReadability.toFixed(2)),
    },
    scene_reports: sceneReports,
  };
};

export const generateManifestWithQualityPipeline = async (
  repoUrl: string,
  repoName: string,
  repoContent: string,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null,
  options: VideoGenerationOptions = {}
): Promise<VideoManifest> => {
  const generationKind = options.kind === "module" ? "module" : "master";
  const scopedRepoName =
    generationKind === "module" && options.module?.title
      ? `${repoName} - ${options.module.title}`
      : repoName;
  const scopedFileContents = buildScopedFileContents(fileContents, options.module);

  if (Object.keys(fileContents).length === 0) {
    const emptyEvidence = buildRepoEvidenceBundle(repoName, fileContents, graphData);
    const emptyKnowledge = buildRepoKnowledgeGraph(
      repoName,
      emptyEvidence,
      fileContents,
      graphData
    );
    const emptyManifest: VideoManifest = {
      title: `${repoName} - Repository Walkthrough`,
      scenes: [
        {
          id: 1,
          type: "intro",
          file_path: "README",
          highlight_lines: [1, 1],
          narration_text: `This repository could not be parsed into real source files, so the walkthrough cannot be evidence-backed yet.`,
          duration_seconds: 12,
          title: "Repository Parse Failed",
          phase: "hook",
          visual_type: "overview",
          visual_kind: "overview",
          bullet_points: [
            "No real source files were available after ingestion.",
            "The quality gate should block voice generation for this run.",
          ],
          source_refs: [],
          sentence_evidence: [],
          quality_flags: {
            has_real_code: false,
            has_source_refs: false,
            has_sentence_evidence: false,
            visual_sync_ready: false,
            placeholder_visual: true,
          },
        },
      ],
      repo_files: [],
      pipeline_version: "v2",
      evidence_bundle: emptyEvidence,
      knowledge_graph: emptyKnowledge,
      generation_profile: {
        kind: generationKind,
        label:
          generationKind === "module"
            ? options.module?.title || "Module video"
            : "Master video",
        module_id: options.module?.id,
        module_title: options.module?.title,
        target_duration_seconds: options.targetDurationSeconds,
        target_duration_label:
          options.targetDurationLabel ||
          (generationKind === "module"
            ? MODULE_VIDEO_TARGET_RANGE_LABEL
            : MASTER_VIDEO_TARGET_RANGE_LABEL),
        generated_at: new Date().toISOString(),
      },
      module_catalog: options.moduleCatalog || undefined,
    };

    return {
      ...emptyManifest,
      quality_report: buildQualityReport(emptyManifest, fileContents),
      rollout_comparison: {
        notes: [
          `Repository URL processed through the evidence-backed V2 pipeline.`,
          `Source URL: ${repoUrl}`,
          `The repository could not be parsed into scene-ready source files.`,
        ],
      },
    };
  }

  const evidence = buildRepoEvidenceBundle(scopedRepoName, scopedFileContents, graphData);
  const knowledgeGraph = buildRepoKnowledgeGraph(
    scopedRepoName,
    evidence,
    scopedFileContents,
    graphData
  );
  const moduleCatalog =
    options.moduleCatalog ||
    discoverRepoVideoModules(repoName, graphData, knowledgeGraph);
  const extracted = extractHighLevelConcepts(
    scopedRepoName,
    evidence,
    scopedFileContents,
    knowledgeGraph,
    graphData
  );
  const orderedConceptPlan = await orderConcepts(
    scopedRepoName,
    extracted.concepts,
    extracted.architecture,
    generationKind,
    options.module?.title
  );
  const plannedTitle = orderedConceptPlan.title;
  const amplifiedConcepts = expandConceptsForGeneration(
    orderedConceptPlan.concepts,
    scopedFileContents,
    graphData,
    generationKind
  );
  const scenePlan: SceneSpec[] = amplifiedConcepts.map((concept, index) => {
    const pack = buildConceptEvidencePack(scopedRepoName, concept, evidence, scopedFileContents, graphData);
    const primaryRef = pack.evidenceRefs[0];
    const type: VideoScene["type"] =
      concept.kind === "hook"
        ? "intro"
        : concept.kind === "repo_map" || concept.kind === "architecture" || concept.kind === "flow"
          ? "overview"
          : concept.kind === "operations"
            ? "support"
            : concept.kind === "conclusion"
              ? "outro"
              : evidence.entry_candidates.includes(pack.filePath)
                ? "entry"
                : evidence.hub_files.includes(pack.filePath)
                  ? "core"
                  : "feature";
    const visualKind: VideoVisualKind =
      concept.kind === "repo_map" || concept.kind === "conclusion"
        ? "repo-map"
        : concept.kind === "architecture" || concept.kind === "flow"
          ? "diagram"
          : "code";

    return {
      id: index + 1,
      phase: concept.phase,
      type,
      title: concept.title,
      sceneGoal: concept.viewerGoal,
      filePath: pack.filePath,
      lineRange: primaryRef
        ? [primaryRef.start_line, primaryRef.end_line]
        : [1, 24],
      visualKind,
      claim: concept.summary,
      evidenceRefs: pack.evidenceRefs,
      diagramSpec: pack.diagramSpec,
      repoMapPaths: pack.repoMapPaths,
      onScreenFocus: pack.onScreenFocus,
      bulletPoints: pack.bulletPoints,
      focusSymbols: pack.focusSymbols,
      durationSeconds:
        concept.kind === "hook" || concept.kind === "flow"
          ? generationKind === "master"
            ? 44
            : 34
          : concept.kind === "architecture" || concept.kind === "repo_map" || concept.kind === "conclusion"
            ? generationKind === "master"
              ? 40
              : 30
            : concept.kind === "operations"
              ? generationKind === "master"
                ? 36
                : 28
              : generationKind === "master"
                ? 48
                : 36,
      generationKind,
      moduleTitle: options.module?.title,
      narrationWordTarget:
        generationKind === "master"
          ? [120, 210]
          : [95, 170],
    };
  });
  const targetDurationSeconds =
    options.targetDurationSeconds ||
    (generationKind === "module"
      ? options.module?.estimated_duration_seconds || 8 * 60
      : moduleCatalog?.master_estimated_duration_seconds ||
        24 * 60);

  const stretchedScenePlan = stretchScenePlanToTarget(
    scenePlan,
    typeof targetDurationSeconds === "number" && Number.isFinite(targetDurationSeconds)
      ? targetDurationSeconds
      : 24 * 60
  );

  const finalScenes: VideoScene[] = [];
  for (const scene of stretchedScenePlan) {
    const draft = await writeScene(scopedRepoName, scene, scopedFileContents);
    const edited = await editScene(scopedRepoName, scene, draft);
    const finalized = finalizeScene(scene, edited, scopedFileContents);
    const validation = validateScene(
      finalized,
      scopedFileContents,
      evidence.source_files.length > 0
    );

    if (validation.blockers.length > 0) {
      const fallback = finalizeScene(scene, fallbackSceneWriter(scene), scopedFileContents);
      finalScenes.push(fallback);
      continue;
    }

    finalScenes.push(finalized);
  }

  const manifest: VideoManifest = {
    title:
      generationKind === "module" && options.module?.title
        ? `${options.module.title} - Code Walkthrough`
        : plannedTitle,
    scenes: finalScenes,
    repo_files: evidence.repo_tree,
    pipeline_version: "v2",
    evidence_bundle: evidence,
    knowledge_graph: knowledgeGraph,
    generation_profile: {
      kind: generationKind,
      label:
        generationKind === "module"
          ? options.module?.title || "Module video"
          : "Master video",
      summary:
        generationKind === "module"
          ? options.module?.summary
          : "Long-form walkthrough across the repository's major architecture areas.",
      module_id: options.module?.id,
      module_title: options.module?.title,
      target_duration_seconds:
        typeof targetDurationSeconds === "number" ? targetDurationSeconds : undefined,
      target_duration_label:
        options.targetDurationLabel ||
        (generationKind === "module"
          ? MODULE_VIDEO_TARGET_RANGE_LABEL
          : MASTER_VIDEO_TARGET_RANGE_LABEL),
      target_scene_count: stretchedScenePlan.length,
      generated_at: new Date().toISOString(),
    },
    module_catalog: moduleCatalog || undefined,
  };

  const qualityReport = buildQualityReport(manifest, scopedFileContents);

  return {
    ...manifest,
    quality_report: qualityReport,
    rollout_comparison: {
      notes: [
        `Repository URL processed through the evidence-backed V2 pipeline.`,
        `A reusable repo knowledge graph was built from the code graph, evidence bundle, facts, hotspots, snippets, and reading paths.`,
        `The model never receives the whole repository dump in one prompt.`,
        `High-level concepts came from code-graph structure first, then each concept retrieved a local evidence pack before script writing.`,
        `Narrative planning, scene writing, and editing were split into bounded passes.`,
        generationKind === "module"
          ? `The walkthrough was scoped to the ${options.module?.title || "selected"} subsystem before writing any scenes.`
          : `The walkthrough was planned as a master video with expanded detail scenes and a longer target runtime.`,
        `Quality gates ${qualityReport.ready_for_tts ? "passed" : "blocked"} before TTS.`,
        `Source URL: ${repoUrl}`,
      ],
    },
  };
};
