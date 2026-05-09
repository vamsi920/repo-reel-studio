import type {
  VideoTree,
  VideoTreeNode,
  VideoNodeType,
  VideoDifficulty,
  DialoguePersonality,
  VideoTreeGenerationPlan,
  VideoTreeStructure,
  VideoNodeSpec,
  VideoCategorySpec,
  ConceptNode,
  RepoIntelligence,
  RepoEvidenceBundle,
  RepoKnowledgeGraph,
  RepoModuleProfile,
  DialogueConfig,
  VisualConfig,
  AudienceLevel,
} from "@/lib/types";

const CONCEPT_CATEGORIES = [
  "architecture",
  "technology",
  "patterns",
  "operations",
  "data",
  "security",
  "testing",
  "deployment",
];

const CONCEPT_COLORS = [
  "#6884ff", // primary blue
  "#4ade80", // emerald
  "#fbbf24", // amber
  "#f87171", // rose
  "#a78bfa", // violet
  "#22d3ee", // cyan
  "#fb923c", // orange
  "#e879f9", // fuchsia
];

export function generateVideoTree(
  plan: VideoTreeGenerationPlan,
  repoUrl: string,
  repoName: string
): VideoTree {
  const { intelligence, evidence, knowledgeGraph, treeStructure } = plan;
  
  // Build the root node and full tree
  const root = buildVideoTreeNode(
    treeStructure.masterVideo,
    null,
    0,
    intelligence
  );
  
  // Add category nodes as children of master
  treeStructure.categories.forEach((category, idx) => {
    const categoryNode = buildCategoryNode(category, root.id, idx, intelligence);
    root.children.push(categoryNode);
  });
  
  // Calculate total stats
  const { totalDuration, totalVideos } = calculateTreeStats(root);
  
  // Extract all unique tags from the tree
  const tags = extractUniqueTags(root);
  
  return {
    id: `tree-${Date.now()}`,
    projectId: plan.projectId,
    repoUrl,
    repoName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    root,
    totalDuration,
    totalVideos,
    tags,
    concepts: treeStructure.conceptMap,
  };
}

export function buildVideoTreePlan(
  intelligence: RepoIntelligence,
  evidence: RepoEvidenceBundle,
  knowledgeGraph: RepoKnowledgeGraph,
  audienceLevel: AudienceLevel = "intermediate"
): VideoTreeGenerationPlan {
  const conceptMap = extractConcepts(intelligence, evidence, knowledgeGraph);
  const treeStructure = buildTreeStructure(intelligence, evidence, conceptMap);
  const dialogueConfig = createDialogueConfig(audienceLevel, intelligence);
  const visualConfig = createVisualConfig();
  
  return {
    id: `plan-${Date.now()}`,
    projectId: intelligence.repo_name,
    createdAt: new Date().toISOString(),
    intelligence,
    evidence,
    knowledgeGraph,
    treeStructure,
    dialogueConfig,
    visualConfig,
  };
}

function buildTreeStructure(
  intelligence: RepoIntelligence,
  evidence: RepoEvidenceBundle,
  conceptMap: ConceptNode[]
): VideoTreeStructure {
  const categories: VideoCategorySpec[] = [];
  
  // 1. Entry Points & Getting Started
  const entryModules = intelligence.modules.filter(m => m.is_entry);
  if (entryModules.length > 0) {
    categories.push({
      name: "Getting Started",
      description: "Entry points and initial setup",
      videos: entryModules.map(module => createVideoSpec(
        module,
        "feature",
        "beginner",
        "friendly"
      )),
      order: 0,
      icon: "🚀",
    });
  }
  
  // 2. Core Features
  const hubModules = intelligence.modules.filter(m => m.is_hub && !m.is_entry);
  if (hubModules.length > 0) {
    const coreVideos = hubModules.map(module => createVideoSpec(
      module,
      "feature",
      module.complexity === "high" ? "advanced" : "intermediate",
      "professional"
    ));
    
    categories.push({
      name: "Core Features",
      description: "Main functionality and key components",
      videos: coreVideos,
      order: 1,
      icon: "⚡",
    });
  }
  
  // 3. Deep Dives
  const complexModules = intelligence.modules.filter(
    m => m.complexity === "high" && !m.is_hub && !m.is_entry
  );
  if (complexModules.length > 0) {
    categories.push({
      name: "Deep Dives",
      description: "Advanced topics and complex implementations",
      videos: complexModules.map(module => createVideoSpec(
        module,
        "deep-dive",
        "advanced",
        "technical"
      )),
      order: 2,
      icon: "🔍",
    });
  }
  
  // 4. Supporting Modules
  const supportModules = intelligence.modules.filter(
    m => !m.is_entry && !m.is_hub && m.complexity !== "high"
  );
  if (supportModules.length > 0) {
    const groupedSupport = groupModulesByTechnology(supportModules);
    let order = 3;
    
    for (const [tech, modules] of Object.entries(groupedSupport)) {
      if (modules.length > 0) {
        categories.push({
          name: tech,
          description: `${tech} related components and utilities`,
          videos: modules.map(module => createVideoSpec(
            module,
            "feature",
            "intermediate",
            "casual"
          )),
          order: order++,
          icon: "📦",
        });
      }
    }
  }
  
  // 5. Concepts & Patterns (if knowledge graph has patterns)
  if (knowledgeGraph.context_capsules.length > 0) {
    const conceptVideos: VideoNodeSpec[] = knowledgeGraph.context_capsules
      .filter(capsule => capsule.purpose === "architecture" || capsule.purpose === "flow")
      .map(capsule => ({
        title: capsule.title,
        type: "concept",
        targetDuration: 3,
        modules: capsule.file_paths,
        concepts: extractConceptsFromCapsule(capsule),
        difficulty: "intermediate",
        narrationStyle: "professional",
      }));
    
    if (conceptVideos.length > 0) {
      categories.push({
        name: "Architecture & Patterns",
        description: "Design patterns and architectural decisions",
        videos: conceptVideos,
        order: categories.length,
        icon: "🏗️",
      });
    }
  }
  
  // Create master video spec
  const masterVideo: VideoNodeSpec = {
    title: `${intelligence.repo_name} - Complete Overview`,
    type: "master",
    targetDuration: 5,
    modules: intelligence.modules.map(m => m.id),
    concepts: conceptMap.map(c => c.label),
    difficulty: "beginner",
    narrationStyle: "friendly",
    children: categories.flatMap(cat => cat.videos),
  };
  
  const totalEstimatedDuration = calculateEstimatedDuration(masterVideo, categories);
  
  return {
    masterVideo,
    categories,
    totalEstimatedDuration,
    conceptMap,
  };
}

function createVideoSpec(
  module: RepoModuleProfile,
  type: VideoNodeType,
  difficulty: VideoDifficulty,
  personality: DialoguePersonality
): VideoNodeSpec {
  const complexity = module.complexity;
  const baseDuration = complexity === "high" ? 6 : complexity === "medium" ? 4 : 3;
  const fileFactor = Math.max(0.5, Math.min(2, module.file_paths.length * 0.2));
  
  return {
    title: module.label,
    type,
    targetDuration: Math.round(baseDuration * fileFactor),
    modules: [module.id],
    concepts: module.technologies,
    difficulty,
    narrationStyle: personality,
  };
}

function buildVideoTreeNode(
  spec: VideoNodeSpec,
  parentId: string | null,
  order: number,
  intelligence: RepoIntelligence
): VideoTreeNode {
  const node: VideoTreeNode = {
    id: `node-${spec.title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    title: spec.title,
    type: spec.type,
    duration: spec.targetDuration * 60, // Convert to seconds
    children: [],
    tags: [...spec.concepts, spec.difficulty, spec.type],
    difficulty: spec.difficulty,
    description: generateDescription(spec, intelligence),
    parentId: parentId || undefined,
    order,
    concepts: spec.concepts,
  };
  
  // Recursively build children if they exist
  if (spec.children) {
    spec.children.forEach((childSpec, idx) => {
      const childNode = buildVideoTreeNode(childSpec, node.id, idx, intelligence);
      node.children.push(childNode);
    });
  }
  
  return node;
}

function buildCategoryNode(
  category: VideoCategorySpec,
  parentId: string,
  order: number,
  intelligence: RepoIntelligence
): VideoTreeNode {
  const categoryNode: VideoTreeNode = {
    id: `category-${category.name.toLowerCase().replace(/\s+/g, "-")}`,
    title: category.name,
    type: "category",
    duration: 0, // Will be calculated from children
    children: [],
    tags: [category.name.toLowerCase()],
    difficulty: "intermediate",
    description: category.description,
    parentId,
    order,
  };
  
  // Add video nodes as children
  category.videos.forEach((videoSpec, idx) => {
    const videoNode = buildVideoTreeNode(videoSpec, categoryNode.id, idx, intelligence);
    categoryNode.children.push(videoNode);
    categoryNode.duration += videoNode.duration;
  });
  
  return categoryNode;
}

function extractConcepts(
  intelligence: RepoIntelligence,
  evidence: RepoEvidenceBundle,
  knowledgeGraph: RepoKnowledgeGraph
): ConceptNode[] {
  const conceptMap = new Map<string, ConceptNode>();
  
  // Extract from technologies
  intelligence.technologies.forEach((tech, idx) => {
    const id = `concept-${tech.toLowerCase().replace(/\s+/g, "-")}`;
    conceptMap.set(id, {
      id,
      label: tech,
      category: "technology",
      weight: 10,
      color: CONCEPT_COLORS[idx % CONCEPT_COLORS.length],
      relatedConcepts: [],
      videoReferences: [],
    });
  });
  
  // Extract from architecture pattern
  if (intelligence.architecture_pattern) {
    const id = `concept-architecture-${intelligence.architecture_pattern.toLowerCase().replace(/\s+/g, "-")}`;
    conceptMap.set(id, {
      id,
      label: intelligence.architecture_pattern,
      category: "architecture",
      weight: 15,
      color: CONCEPT_COLORS[0],
      relatedConcepts: [],
      videoReferences: [],
    });
  }
  
  // Extract from module labels and descriptions
  intelligence.modules.forEach(module => {
    // Extract key terms from module description
    const keyTerms = extractKeyTerms(module.description);
    keyTerms.forEach(term => {
      const id = `concept-${term.toLowerCase().replace(/\s+/g, "-")}`;
      if (!conceptMap.has(id)) {
        conceptMap.set(id, {
          id,
          label: term,
          category: "patterns",
          weight: 5,
          color: CONCEPT_COLORS[conceptMap.size % CONCEPT_COLORS.length],
          relatedConcepts: [],
          videoReferences: [module.id],
        });
      } else {
        conceptMap.get(id)!.videoReferences.push(module.id);
        conceptMap.get(id)!.weight += 2;
      }
    });
  });
  
  // Extract from knowledge graph nodes
  knowledgeGraph.nodes
    .filter(node => node.kind === "technology" || node.kind === "architecture")
    .forEach(node => {
      const id = `concept-${node.label.toLowerCase().replace(/\s+/g, "-")}`;
      if (!conceptMap.has(id)) {
        conceptMap.set(id, {
          id,
          label: node.label,
          category: node.kind,
          weight: node.score || 5,
          color: CONCEPT_COLORS[conceptMap.size % CONCEPT_COLORS.length],
          relatedConcepts: [],
          videoReferences: [],
        });
      }
    });
  
  // Build relationships between concepts
  const concepts = Array.from(conceptMap.values());
  concepts.forEach(concept => {
    // Find related concepts based on co-occurrence in modules
    concepts.forEach(other => {
      if (concept.id !== other.id) {
        const sharedVideos = concept.videoReferences.filter(
          v => other.videoReferences.includes(v)
        );
        if (sharedVideos.length > 0) {
          concept.relatedConcepts.push(other.id);
        }
      }
    });
  });
  
  return concepts;
}

function extractKeyTerms(text: string): string[] {
  // Simple keyword extraction - in production, use NLP library
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "about", "as", "is", "was", "are", "were",
    "been", "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "should", "could", "may", "might", "can", "this", "that", "these", "those",
  ]);
  
  const words = text.toLowerCase().split(/\s+/);
  const terms = words
    .filter(word => word.length > 3 && !stopWords.has(word))
    .filter(word => /^[a-z]+$/.test(word));
  
  // Return top 3-5 most relevant terms (simplified)
  return Array.from(new Set(terms)).slice(0, 5);
}

function extractConceptsFromCapsule(capsule: any): string[] {
  const concepts: string[] = [];
  
  if (capsule.summary) {
    concepts.push(...extractKeyTerms(capsule.summary));
  }
  
  if (capsule.teaching_goal) {
    concepts.push(...extractKeyTerms(capsule.teaching_goal));
  }
  
  return Array.from(new Set(concepts));
}

function groupModulesByTechnology(
  modules: RepoModuleProfile[]
): Record<string, RepoModuleProfile[]> {
  const groups: Record<string, RepoModuleProfile[]> = {};
  
  modules.forEach(module => {
    const primaryTech = module.technologies[0] || "Utilities";
    if (!groups[primaryTech]) {
      groups[primaryTech] = [];
    }
    groups[primaryTech].push(module);
  });
  
  return groups;
}

function calculateEstimatedDuration(
  masterVideo: VideoNodeSpec,
  categories: VideoCategorySpec[]
): number {
  let total = masterVideo.targetDuration;
  
  categories.forEach(category => {
    category.videos.forEach(video => {
      total += video.targetDuration;
    });
  });
  
  return total;
}

function calculateTreeStats(root: VideoTreeNode): {
  totalDuration: number;
  totalVideos: number;
} {
  let totalDuration = root.duration;
  let totalVideos = 1;
  
  function traverse(node: VideoTreeNode) {
    node.children.forEach(child => {
      totalDuration += child.duration;
      totalVideos++;
      traverse(child);
    });
  }
  
  traverse(root);
  
  return { totalDuration, totalVideos };
}

function extractUniqueTags(root: VideoTreeNode): string[] {
  const tags = new Set<string>();
  
  function traverse(node: VideoTreeNode) {
    node.tags.forEach(tag => tags.add(tag));
    node.children.forEach(child => traverse(child));
  }
  
  traverse(root);
  
  return Array.from(tags);
}

function generateDescription(
  spec: VideoNodeSpec,
  intelligence: RepoIntelligence
): string {
  const module = intelligence.modules.find(m => spec.modules.includes(m.id));
  
  if (module) {
    return module.description;
  }
  
  // Generate based on type
  switch (spec.type) {
    case "master":
      return `Complete overview of ${intelligence.repo_name}, covering ${intelligence.modules.length} modules and ${intelligence.technologies.join(", ")}`;
    case "category":
      return `Explore ${spec.title} with ${spec.concepts.length} key concepts`;
    case "feature":
      return `Learn about ${spec.title} implementation and usage`;
    case "deep-dive":
      return `Advanced exploration of ${spec.title} internals and architecture`;
    case "concept":
      return `Understanding ${spec.title} patterns and best practices`;
    default:
      return `Video about ${spec.title}`;
  }
}

function createDialogueConfig(
  audienceLevel: AudienceLevel,
  intelligence: RepoIntelligence
): DialogueConfig {
  const personality: DialoguePersonality = 
    audienceLevel === "expert" ? "technical" :
    audienceLevel === "beginner" ? "friendly" :
    "professional";
  
  return {
    defaultPersonality: personality,
    audienceLevel,
    storyArcTemplate: ["hook", "exploration", "revelation", "mastery", "conclusion"],
    transitionPhrases: {
      hook: [
        "Let's dive into something fascinating...",
        "Here's what makes this interesting...",
        "You're about to discover...",
      ],
      exploration: [
        "Now, let's explore how this works...",
        "Looking deeper into the implementation...",
        "Let's see what's happening under the hood...",
      ],
      revelation: [
        "Here's the key insight...",
        "The real magic happens when...",
        "This is where it gets powerful...",
      ],
      mastery: [
        "Now you understand how to...",
        "You can apply this knowledge to...",
        "With this understanding, you can...",
      ],
      conclusion: [
        "Let's recap what we've learned...",
        "To summarize the key points...",
        "Remember these important concepts...",
      ],
    },
    emphasizeTerms: intelligence.technologies,
  };
}

function createVisualConfig(): VisualConfig {
  return {
    wordCloudEnabled: true,
    neuralGraphEnabled: true,
    particleEffects: true,
    animationIntensity: "high",
    colorPalette: CONCEPT_COLORS,
    transitionStyle: "particle",
  };
}

// Export utility functions for use in components
export function getRecommendedPath(
  tree: VideoTree,
  userLevel: AudienceLevel
): VideoTreeNode[] {
  const path: VideoTreeNode[] = [];
  
  // Always start with master overview
  path.push(tree.root);
  
  // Add beginner videos for beginners
  if (userLevel === "beginner") {
    const beginnerNodes = findNodesByDifficulty(tree.root, "beginner");
    path.push(...beginnerNodes.slice(0, 3));
  }
  
  // Add intermediate content
  const intermediateNodes = findNodesByDifficulty(tree.root, "intermediate");
  path.push(...intermediateNodes.slice(0, 3));
  
  // Add advanced for experts
  if (userLevel === "expert") {
    const advancedNodes = findNodesByDifficulty(tree.root, "advanced");
    path.push(...advancedNodes);
  }
  
  return path;
}

function findNodesByDifficulty(
  root: VideoTreeNode,
  difficulty: VideoDifficulty
): VideoTreeNode[] {
  const nodes: VideoTreeNode[] = [];
  
  function traverse(node: VideoTreeNode) {
    if (node.difficulty === difficulty && node.type !== "category") {
      nodes.push(node);
    }
    node.children.forEach(child => traverse(child));
  }
  
  traverse(root);
  return nodes;
}

export function findNodeById(
  root: VideoTreeNode,
  nodeId: string
): VideoTreeNode | null {
  if (root.id === nodeId) return root;
  
  for (const child of root.children) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  
  return null;
}

export function getNodePath(
  root: VideoTreeNode,
  nodeId: string
): VideoTreeNode[] {
  const path: VideoTreeNode[] = [];
  
  function findPath(node: VideoTreeNode): boolean {
    path.push(node);
    
    if (node.id === nodeId) return true;
    
    for (const child of node.children) {
      if (findPath(child)) return true;
    }
    
    path.pop();
    return false;
  }
  
  findPath(root);
  return path;
}