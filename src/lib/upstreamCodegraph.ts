import type {
  CodegraphCsvRow,
  CodegraphEngineData,
  CodegraphEntityIndexEntry,
  CodegraphModuleIndexEntry,
  GitNexusGraphData,
  GitNexusNode,
} from "@/lib/types";

type InvestigationMode =
  | "security"
  | "architecture"
  | "runtime"
  | "data"
  | "onboarding"
  | "dependencies"
  | "general";

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );

const fileNameFromPath = (value: string) => {
  const normalized = (value || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized || "module";
};

const toModuleId = (filePath: string) => `module:${filePath}`;
const toEntityId = (node: GitNexusNode) => `entity:${node.id}`;

const normalizeEntityType = (node: GitNexusNode): string => {
  switch (node.kind) {
    case "Class":
    case "Interface":
    case "Component":
    case "Module":
    case "Enum":
      return "class";
    case "Method":
    case "Function":
    case "Hook":
      return "function";
    default:
      return "variable";
  }
};

const buildFallbackCodegraphData = (
  graphData?: GitNexusGraphData | null
): CodegraphEngineData | null => {
  if (!graphData || (!graphData.nodes?.length && !graphData.clusters?.length)) {
    return null;
  }

  const modulesByPath = new Map<
    string,
    {
      id: string;
      fullPath: string;
      label: string;
      lines: number;
      entityIds: string[];
      entityEntries: CodegraphEntityIndexEntry[];
      dependencies: Set<string>;
      dependents: Set<string>;
      incomingLinks: number;
      outgoingLinks: number;
      clusterIds: Set<string>;
    }
  >();

  const ensureModule = (filePath: string) => {
    const normalized = (filePath || "").trim();
    if (!normalized) return null;
    const existing = modulesByPath.get(normalized);
    if (existing) return existing;
    const created = {
      id: toModuleId(normalized),
      fullPath: normalized,
      label: fileNameFromPath(normalized),
      lines: 0,
      entityIds: [],
      entityEntries: [],
      dependencies: new Set<string>(),
      dependents: new Set<string>(),
      incomingLinks: 0,
      outgoingLinks: 0,
      clusterIds: new Set<string>(),
    };
    modulesByPath.set(normalized, created);
    return created;
  };

  graphData.nodes.forEach((node) => {
    const moduleEntry = ensureModule(node.filePath);
    if (!moduleEntry) return;
    moduleEntry.lines = Math.max(moduleEntry.lines, node.lineCount || 0, node.endLine || 0);
  });

  const rawNodes: CodegraphEngineData["graph"]["nodes"] = [];
  const rawLinks: CodegraphEngineData["graph"]["links"] = [];
  const entityIndex: CodegraphEntityIndexEntry[] = [];
  const rawLinkKeys = new Set<string>();

  const pushRawLink = (
    source: string,
    target: string,
    type: "module-entity" | "dependency" | "module-module",
    weight = 1,
  ) => {
    if (!source || !target || source === target) return false;
    const key = `${type}:${source}->${target}`;
    if (rawLinkKeys.has(key)) return false;
    rawLinkKeys.add(key);
    rawLinks.push({ source, target, type, weight });
    return true;
  };

  graphData.nodes.forEach((node) => {
    const moduleEntry = ensureModule(node.filePath);
    if (!moduleEntry) return;

    if (node.kind === "File") {
      return;
    }

    const entityId = toEntityId(node);
    moduleEntry.entityIds.push(entityId);

    const entityEntry: CodegraphEntityIndexEntry = {
      id: entityId,
      name: node.name,
      entityType: normalizeEntityType(node),
      lines: node.lineCount || Math.max(0, (node.endLine || 0) - (node.startLine || 0)),
      startLine: node.startLine,
      endLine: node.endLine,
      linksIn: 0,
      linksOut: 0,
      modulePath: moduleEntry.fullPath,
    };

    moduleEntry.entityEntries.push(entityEntry);
    entityIndex.push(entityEntry);
    pushRawLink(moduleEntry.id, entityId, "module-entity");
  });

  const nodeLookup = new Map(graphData.nodes.map((node) => [node.id, node] as const));
  const entityIdsByNodeId = new Map(
    graphData.nodes
      .filter((node) => node.kind !== "File")
      .map((node) => [node.id, toEntityId(node)] as const),
  );

  graphData.edges.forEach((edge) => {
    const sourceNode = nodeLookup.get(edge.source);
    const targetNode = nodeLookup.get(edge.target);
    if (!sourceNode || !targetNode) return;

    const sourceModule = ensureModule(sourceNode.filePath);
    const targetModule = ensureModule(targetNode.filePath);

    if (edge.type === "DEFINED_IN" || edge.type === "MEMBER_OF") {
      return;
    }

    if (
      sourceModule &&
      targetModule &&
      sourceModule.fullPath !== targetModule.fullPath &&
      ["IMPORTS", "CALLS", "USES_TYPE", "EXTENDS", "IMPLEMENTS", "EXPORTS", "TESTS"].includes(edge.type)
    ) {
      if (pushRawLink(sourceModule.id, targetModule.id, "module-module")) {
        sourceModule.dependencies.add(targetModule.fullPath);
        targetModule.dependents.add(sourceModule.fullPath);
        sourceModule.outgoingLinks += 1;
        targetModule.incomingLinks += 1;
      }
    }

    const sourceEntityId = entityIdsByNodeId.get(sourceNode.id);
    const targetEntityId = entityIdsByNodeId.get(targetNode.id);

    if (sourceEntityId && targetEntityId && sourceEntityId !== targetEntityId) {
      pushRawLink(sourceEntityId, targetEntityId, "dependency");

      const sourceEntity = entityIndex.find((entry) => entry.id === sourceEntityId);
      const targetEntity = entityIndex.find((entry) => entry.id === targetEntityId);
      if (sourceEntity) sourceEntity.linksOut += 1;
      if (targetEntity) targetEntity.linksIn += 1;
    } else if (sourceEntityId && targetModule && sourceNode.filePath !== targetNode.filePath) {
      pushRawLink(sourceEntityId, targetModule.id, "dependency");
      const sourceEntity = entityIndex.find((entry) => entry.id === sourceEntityId);
      if (sourceEntity) sourceEntity.linksOut += 1;
    }
  });

  graphData.clusters.forEach((cluster) => {
    const clusterMembers = cluster.members
      .map((memberId) => nodeLookup.get(memberId))
      .filter((node): node is GitNexusNode => Boolean(node?.filePath))
      .map((node) => node.filePath);

    const uniqueMembers = uniqueStrings(clusterMembers);
    uniqueMembers.forEach((filePath) => ensureModule(filePath)?.clusterIds.add(cluster.id));

    const hasModuleLinks = rawLinks.some((link) => {
      if (link.type !== "module-module") return false;
      const source = typeof link.source === "string" ? link.source : link.source.id;
      const target = typeof link.target === "string" ? link.target : link.target.id;
      return uniqueMembers.includes(source.replace(/^module:/, "")) || uniqueMembers.includes(target.replace(/^module:/, ""));
    });

    if (!hasModuleLinks && uniqueMembers.length > 1) {
      uniqueMembers
        .slice()
        .sort()
        .forEach((filePath, index, items) => {
          const next = items[index + 1];
          if (!next) return;
          const leftModule = ensureModule(filePath);
          const rightModule = ensureModule(next);
          if (!leftModule || !rightModule) return;
          if (pushRawLink(leftModule.id, rightModule.id, "module-module", 0.35)) {
            leftModule.dependencies.add(rightModule.fullPath);
            rightModule.dependents.add(leftModule.fullPath);
            leftModule.outgoingLinks += 1;
            rightModule.incomingLinks += 1;
          }
        });
    }
  });

  const moduleEntries = [...modulesByPath.values()].sort((left, right) =>
    left.fullPath.localeCompare(right.fullPath),
  );

  moduleEntries.forEach((moduleEntry) => {
    rawNodes.push({
      id: moduleEntry.id,
      label: moduleEntry.label,
      type: "module",
      fullPath: moduleEntry.fullPath,
      lines: moduleEntry.lines || 1,
      weight:
        1 +
        moduleEntry.entityEntries.length +
        moduleEntry.dependencies.size +
        moduleEntry.dependents.size,
    });
  });

  entityIndex.forEach((entity) => {
    rawNodes.push({
      id: entity.id,
      label: entity.name,
      type: "entity",
      parent: toModuleId(entity.modulePath),
      fullPath: entity.modulePath,
      entityType: entity.entityType,
      lines: entity.lines || 1,
      startLine: entity.startLine,
      endLine: entity.endLine,
      weight: 1 + entity.linksIn + entity.linksOut,
    });
  });

  const moduleIndex: CodegraphModuleIndexEntry[] = moduleEntries.map((moduleEntry) => ({
    id: moduleEntry.id,
    label: moduleEntry.label,
    fullPath: moduleEntry.fullPath,
    entityCount: moduleEntry.entityEntries.length,
    incomingLinks: moduleEntry.incomingLinks,
    outgoingLinks: moduleEntry.outgoingLinks,
    lines: moduleEntry.lines || 1,
    dependencies: [...moduleEntry.dependencies].sort(),
    dependents: [...moduleEntry.dependents].sort(),
    topEntities: moduleEntry.entityEntries
      .slice()
      .sort((left, right) => (right.linksIn + right.linksOut + right.lines) - (left.linksIn + left.linksOut + left.lines))
      .slice(0, 6)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        lines: entity.lines,
        startLine: entity.startLine,
        endLine: entity.endLine,
        linksIn: entity.linksIn,
        linksOut: entity.linksOut,
      })),
  }));

  const csvRows: CodegraphCsvRow[] = [
    ...moduleIndex.map((moduleEntry) => ({
      name: moduleEntry.label,
      type: "module",
      parent_module: "",
      full_path: moduleEntry.fullPath,
      links_out: moduleEntry.outgoingLinks,
      links_in: moduleEntry.incomingLinks,
      lines: moduleEntry.lines,
    })),
    ...entityIndex.map((entity) => ({
      name: entity.name,
      type: entity.entityType,
      parent_module: entity.modulePath,
      full_path: entity.modulePath,
      links_out: entity.linksOut,
      links_in: entity.linksIn,
      lines: entity.lines,
    })),
  ];

  const mostConnectedModules = moduleIndex
    .slice()
    .sort(
      (left, right) =>
        right.incomingLinks + right.outgoingLinks - (left.incomingLinks + left.outgoingLinks),
    )
    .slice(0, 8)
    .map((moduleEntry) => ({
      fullPath: moduleEntry.fullPath,
      incomingLinks: moduleEntry.incomingLinks,
      outgoingLinks: moduleEntry.outgoingLinks,
      entityCount: moduleEntry.entityCount,
    }));

  const hottestEntities = entityIndex
    .slice()
    .sort(
      (left, right) =>
        right.linksIn + right.linksOut + right.lines - (left.linksIn + left.linksOut + left.lines),
    )
    .slice(0, 10)
    .map((entity) => ({
      name: entity.name,
      modulePath: entity.modulePath,
      entityType: entity.entityType,
      lines: entity.lines,
      linksIn: entity.linksIn,
      linksOut: entity.linksOut,
    }));

  const unlinkedModules = moduleIndex
    .filter((moduleEntry) => moduleEntry.incomingLinks === 0 && moduleEntry.outgoingLinks === 0)
    .map((moduleEntry) => ({
      id: moduleEntry.id,
      fullPath: moduleEntry.fullPath,
    }));

  return {
    engine: "xnuinside-codegraph",
    source: "gitnexus-fallback",
    generatedAt: new Date().toISOString(),
    graph: {
      nodes: rawNodes,
      links: rawLinks,
      unlinkedModules,
    },
    moduleIndex,
    entityIndex,
    csvRows,
    stats: {
      pythonFileCount: 0,
      moduleCount: moduleIndex.length,
      entityCount: entityIndex.length,
      externalCount: 0,
      linkCount: rawLinks.length,
      unlinkedModuleCount: unlinkedModules.length,
    },
    summary: {
      mostConnectedModules,
      hottestEntities,
      externalDependencies: [],
    },
  };
};

export const getCodegraphData = (
  graphData?: GitNexusGraphData | null
): CodegraphEngineData | null => graphData?.codegraph || buildFallbackCodegraphData(graphData);

const moduleModeBoost = (fullPath: string, mode: InvestigationMode) => {
  const lower = fullPath.toLowerCase();

  if (mode === "security" && /(auth|token|session|secret|permission|policy|middleware|guard|security)/i.test(lower)) {
    return 34;
  }
  if (mode === "runtime" && /(app|main|server|cli|route|handler|controller|job|worker)/i.test(lower)) {
    return 28;
  }
  if (mode === "data" && /(db|database|schema|model|store|repository|query|migration)/i.test(lower)) {
    return 28;
  }
  if (mode === "architecture" && /(src|app|server|core|services|domain|api|modules?)/i.test(lower)) {
    return 20;
  }
  if (mode === "onboarding" && /(main|app|server|cli|bootstrap|entry|core)/i.test(lower)) {
    return 22;
  }
  if (mode === "dependencies" && /(shared|common|util|lib|base|core|types?)/i.test(lower)) {
    return 18;
  }

  return 0;
};

const entityModeBoost = (entity: CodegraphEntityIndexEntry, mode: InvestigationMode) => {
  const haystack = `${entity.name} ${entity.modulePath}`.toLowerCase();

  if (mode === "security" && /(auth|token|session|secret|permission|guard|policy|validate)/i.test(haystack)) {
    return 28;
  }
  if (mode === "runtime" && /(main|run|execute|dispatch|handle|process|route)/i.test(haystack)) {
    return 24;
  }
  if (mode === "data" && /(query|save|load|store|persist|schema|model|repository)/i.test(haystack)) {
    return 24;
  }
  if (mode === "dependencies" && /(base|shared|util|provider|factory)/i.test(haystack)) {
    return 18;
  }

  return 0;
};

export const scoreCodegraphModule = (
  moduleEntry: CodegraphModuleIndexEntry,
  tokens: string[],
  mode: InvestigationMode = "general"
) => {
  const haystack = [
    moduleEntry.fullPath,
    moduleEntry.label,
    moduleEntry.dependencies.join(" "),
    moduleEntry.dependents.join(" "),
    moduleEntry.topEntities.map((entity) => entity.name).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let score =
    moduleEntry.incomingLinks * 4 +
    moduleEntry.outgoingLinks * 3 +
    moduleEntry.entityCount * 2 +
    Math.min(moduleEntry.lines / 8, 30);

  tokens.forEach((token) => {
    if (haystack.includes(token)) score += 18;
  });

  score += moduleModeBoost(moduleEntry.fullPath, mode);
  return score;
};

export const scoreCodegraphEntity = (
  entity: CodegraphEntityIndexEntry,
  tokens: string[],
  mode: InvestigationMode = "general"
) => {
  const haystack = `${entity.name} ${entity.modulePath} ${entity.entityType}`.toLowerCase();
  let score =
    entity.linksIn * 5 +
    entity.linksOut * 4 +
    Math.min(entity.lines, 30);

  tokens.forEach((token) => {
    if (haystack.includes(token)) score += 18;
  });

  score += entityModeBoost(entity, mode);
  return score;
};

export const getRelevantCodegraphModules = (
  graphData?: GitNexusGraphData | null,
  tokens: string[] = [],
  mode: InvestigationMode = "general",
  limit = 8
) => {
  const codegraph = getCodegraphData(graphData);
  if (!codegraph) return [];

  return [...codegraph.moduleIndex]
    .sort((a, b) => scoreCodegraphModule(b, tokens, mode) - scoreCodegraphModule(a, tokens, mode))
    .slice(0, limit);
};

export const getRelevantCodegraphEntities = (
  graphData?: GitNexusGraphData | null,
  tokens: string[] = [],
  mode: InvestigationMode = "general",
  limit = 10
) => {
  const codegraph = getCodegraphData(graphData);
  if (!codegraph) return [];

  return [...codegraph.entityIndex]
    .sort((a, b) => scoreCodegraphEntity(b, tokens, mode) - scoreCodegraphEntity(a, tokens, mode))
    .slice(0, limit);
};

export const getCodegraphRelatedFiles = (
  graphData?: GitNexusGraphData | null,
  filePaths: string[] = [],
  limit = 8
) => {
  const codegraph = getCodegraphData(graphData);
  if (!codegraph || filePaths.length === 0) return [];

  const moduleLookup = new Map(
    codegraph.moduleIndex.map((entry) => [entry.fullPath, entry] as const)
  );

  const related = uniqueStrings(
    filePaths.flatMap((filePath) => {
      const moduleEntry = moduleLookup.get(filePath);
      if (!moduleEntry) return [];
      return [
        ...moduleEntry.dependencies,
        ...moduleEntry.dependents,
      ];
    })
  );

  return related.filter((filePath) => !filePaths.includes(filePath)).slice(0, limit);
};

export const buildCodegraphQuestionContext = (
  graphData?: GitNexusGraphData | null,
  tokens: string[] = [],
  mode: InvestigationMode = "general"
) => {
  const codegraph = getCodegraphData(graphData);
  if (!codegraph) return null;

  const modules = getRelevantCodegraphModules(graphData, tokens, mode, 5);
  const entities = getRelevantCodegraphEntities(graphData, tokens, mode, 6);
  const externalDependencies = codegraph.summary.externalDependencies.slice(0, 6);

  return {
    modules,
    entities,
    externalDependencies,
    stats: codegraph.stats,
  };
};

export const serializeCodegraphCsvRows = (rows: CodegraphCsvRow[]) => {
  const header = [
    "name",
    "type",
    "parent_module",
    "full_path",
    "links_out",
    "links_in",
    "lines",
  ];

  const escape = (value: string | number) => {
    const text = `${value ?? ""}`;
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  return [header.join(","), ...rows.map((row) => header.map((key) => escape(row[key as keyof CodegraphCsvRow])).join(","))].join("\n");
};
