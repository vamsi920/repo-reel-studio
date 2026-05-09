import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  generateVideoTree, 
  buildVideoTreePlan, 
  getRecommendedPath,
  findNodeById 
} from "@/lib/videoTree";
import { enhanceVideoManifestDialogue } from "@/lib/dialogueEnhancer";
import type {
  VideoTree,
  VideoTreeNode,
  VideoTreeGenerationPlan,
  UserVideoProgress,
  RepoIntelligence,
  RepoEvidenceBundle,
  RepoKnowledgeGraph,
  AudienceLevel,
  DialoguePersonality,
} from "@/lib/types";

interface UseVideoTreeOptions {
  intelligence: RepoIntelligence | null;
  evidence: RepoEvidenceBundle | null;
  knowledgeGraph: RepoKnowledgeGraph | null;
  audienceLevel?: AudienceLevel;
  personality?: DialoguePersonality;
  repoUrl?: string;
  repoName?: string;
  enableCaching?: boolean;
}

interface UseVideoTreeReturn {
  tree: VideoTree | null;
  plan: VideoTreeGenerationPlan | null;
  currentNode: VideoTreeNode | null;
  userProgress: UserVideoProgress | null;
  recommendedPath: VideoTreeNode[];
  isGenerating: boolean;
  error: string | null;
  
  // Actions
  generateTree: () => Promise<void>;
  selectNode: (nodeId: string) => void;
  markNodeComplete: (nodeId: string) => void;
  updateProgress: (nodeId: string, progress: number) => void;
  resetProgress: () => void;
  
  // Navigation
  navigateToParent: () => void;
  navigateToChild: (childIndex: number) => void;
  navigateToRecommended: () => void;
  
  // Utilities
  searchNodes: (query: string) => VideoTreeNode[];
  getNodeStats: (nodeId: string) => NodeStats;
  exportTree: () => string;
  importTree: (data: string) => void;
}

interface NodeStats {
  totalDuration: number;
  completedDuration: number;
  childrenCount: number;
  completedChildren: number;
  progressPercentage: number;
}

const CACHE_KEY = "video-tree-cache";
const PROGRESS_KEY = "video-tree-progress";

export function useVideoTree({
  intelligence,
  evidence,
  knowledgeGraph,
  audienceLevel = "intermediate",
  personality = "friendly",
  repoUrl = "",
  repoName = "",
  enableCaching = true,
}: UseVideoTreeOptions): UseVideoTreeReturn {
  const [tree, setTree] = useState<VideoTree | null>(null);
  const [plan, setPlan] = useState<VideoTreeGenerationPlan | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [userProgress, setUserProgress] = useState<UserVideoProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Performance optimization with refs
  const treeRef = useRef<VideoTree | null>(null);
  const progressRef = useRef<UserVideoProgress | null>(null);
  
  // Update refs when state changes
  useEffect(() => {
    treeRef.current = tree;
    progressRef.current = userProgress;
  }, [tree, userProgress]);
  
  // Load cached data on mount
  useEffect(() => {
    if (!enableCaching) return;
    
    try {
      const cachedTree = localStorage.getItem(CACHE_KEY);
      const cachedProgress = localStorage.getItem(PROGRESS_KEY);
      
      if (cachedTree) {
        const parsed = JSON.parse(cachedTree);
        setTree(parsed);
      }
      
      if (cachedProgress) {
        const parsed = JSON.parse(cachedProgress);
        setUserProgress(parsed);
      }
    } catch (err) {
      console.error("Failed to load cached data:", err);
    }
  }, [enableCaching]);
  
  // Save to cache when data changes
  useEffect(() => {
    if (!enableCaching) return;
    
    try {
      if (tree) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(tree));
      }
      
      if (userProgress) {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(userProgress));
      }
    } catch (err) {
      console.error("Failed to save cache:", err);
    }
  }, [tree, userProgress, enableCaching]);
  
  // Generate tree from intelligence data
  const generateTree = useCallback(async () => {
    if (!intelligence || !evidence || !knowledgeGraph) {
      setError("Missing required data for tree generation");
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // Build the plan
      const generationPlan = buildVideoTreePlan(
        intelligence,
        evidence,
        knowledgeGraph,
        audienceLevel
      );
      setPlan(generationPlan);
      
      // Generate the tree
      const generatedTree = generateVideoTree(
        generationPlan,
        repoUrl,
        repoName || intelligence.repo_name
      );
      setTree(generatedTree);
      
      // Initialize user progress
      const initialProgress: UserVideoProgress = {
        userId: "user-1", // In production, get from auth
        completedVideos: [],
        currentVideo: generatedTree.root.id,
        totalWatchTime: 0,
        lastAccessed: new Date().toISOString(),
        recommendedPath: getRecommendedPath(generatedTree, audienceLevel).map(n => n.id),
        bookmarks: [],
      };
      setUserProgress(initialProgress);
      setCurrentNodeId(generatedTree.root.id);
      
      // Enhance dialogues for all nodes (async, non-blocking)
      setTimeout(() => {
        enhanceAllNodeDialogues(generatedTree, personality, audienceLevel);
      }, 100);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate tree");
      console.error("Tree generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [intelligence, evidence, knowledgeGraph, audienceLevel, personality, repoUrl, repoName]);
  
  // Enhance dialogues for better narration
  const enhanceAllNodeDialogues = useCallback(
    async (tree: VideoTree, personality: DialoguePersonality, audienceLevel: AudienceLevel) => {
      // This would enhance all video manifest dialogues in the tree
      // For performance, this runs in the background
      console.log("Enhancing dialogues for", tree.totalVideos, "videos");
    },
    []
  );
  
  // Select a node
  const selectNode = useCallback((nodeId: string) => {
    if (!tree) return;
    
    const node = findNodeById(tree.root, nodeId);
    if (node) {
      setCurrentNodeId(nodeId);
      
      // Update progress
      setUserProgress(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentVideo: nodeId,
          lastAccessed: new Date().toISOString(),
        };
      });
    }
  }, [tree]);
  
  // Mark a node as complete
  const markNodeComplete = useCallback((nodeId: string) => {
    setUserProgress(prev => {
      if (!prev) return null;
      
      const alreadyCompleted = prev.completedVideos.includes(nodeId);
      if (alreadyCompleted) return prev;
      
      return {
        ...prev,
        completedVideos: [...prev.completedVideos, nodeId],
        totalWatchTime: prev.totalWatchTime + (tree?.root ? getNodeDuration(tree.root, nodeId) : 0),
      };
    });
  }, [tree]);
  
  // Update node progress
  const updateProgress = useCallback((nodeId: string, progress: number) => {
    // In a real app, this would update progress tracking
    console.log(`Node ${nodeId} progress: ${progress}%`);
  }, []);
  
  // Reset all progress
  const resetProgress = useCallback(() => {
    if (!tree) return;
    
    setUserProgress({
      userId: "user-1",
      completedVideos: [],
      currentVideo: tree.root.id,
      totalWatchTime: 0,
      lastAccessed: new Date().toISOString(),
      recommendedPath: getRecommendedPath(tree, audienceLevel).map(n => n.id),
      bookmarks: [],
    });
    setCurrentNodeId(tree.root.id);
  }, [tree, audienceLevel]);
  
  // Navigate to parent node
  const navigateToParent = useCallback(() => {
    if (!tree || !currentNodeId) return;
    
    const currentNode = findNodeById(tree.root, currentNodeId);
    if (currentNode?.parentId) {
      selectNode(currentNode.parentId);
    }
  }, [tree, currentNodeId, selectNode]);
  
  // Navigate to child node
  const navigateToChild = useCallback((childIndex: number) => {
    if (!tree || !currentNodeId) return;
    
    const currentNode = findNodeById(tree.root, currentNodeId);
    if (currentNode && currentNode.children[childIndex]) {
      selectNode(currentNode.children[childIndex].id);
    }
  }, [tree, currentNodeId, selectNode]);
  
  // Navigate to next recommended node
  const navigateToRecommended = useCallback(() => {
    if (!userProgress || userProgress.recommendedPath.length === 0) return;
    
    const currentIndex = userProgress.recommendedPath.indexOf(currentNodeId || "");
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < userProgress.recommendedPath.length) {
      selectNode(userProgress.recommendedPath[nextIndex]);
    }
  }, [userProgress, currentNodeId, selectNode]);
  
  // Search nodes by query
  const searchNodes = useCallback((query: string): VideoTreeNode[] => {
    if (!tree || !query) return [];
    
    const results: VideoTreeNode[] = [];
    const lowerQuery = query.toLowerCase();
    
    function searchTree(node: VideoTreeNode) {
      if (
        node.title.toLowerCase().includes(lowerQuery) ||
        node.description.toLowerCase().includes(lowerQuery) ||
        node.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push(node);
      }
      
      node.children.forEach(child => searchTree(child));
    }
    
    searchTree(tree.root);
    return results;
  }, [tree]);
  
  // Get node statistics
  const getNodeStats = useCallback((nodeId: string): NodeStats => {
    if (!tree || !userProgress) {
      return {
        totalDuration: 0,
        completedDuration: 0,
        childrenCount: 0,
        completedChildren: 0,
        progressPercentage: 0,
      };
    }
    
    const node = findNodeById(tree.root, nodeId);
    if (!node) {
      return {
        totalDuration: 0,
        completedDuration: 0,
        childrenCount: 0,
        completedChildren: 0,
        progressPercentage: 0,
      };
    }
    
    const stats = calculateNodeStats(node, userProgress.completedVideos);
    return stats;
  }, [tree, userProgress]);
  
  // Export tree as JSON
  const exportTree = useCallback((): string => {
    if (!tree) return "{}";
    
    return JSON.stringify({
      tree,
      progress: userProgress,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }, [tree, userProgress]);
  
  // Import tree from JSON
  const importTree = useCallback((data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.tree) {
        setTree(parsed.tree);
      }
      if (parsed.progress) {
        setUserProgress(parsed.progress);
      }
    } catch (err) {
      setError("Failed to import tree data");
      console.error("Import failed:", err);
    }
  }, []);
  
  // Computed values
  const currentNode = useMemo(() => {
    if (!tree || !currentNodeId) return null;
    return findNodeById(tree.root, currentNodeId);
  }, [tree, currentNodeId]);
  
  const recommendedPath = useMemo(() => {
    if (!tree || !userProgress) return [];
    return userProgress.recommendedPath
      .map(nodeId => findNodeById(tree.root, nodeId))
      .filter(Boolean) as VideoTreeNode[];
  }, [tree, userProgress]);
  
  return {
    tree,
    plan,
    currentNode,
    userProgress,
    recommendedPath,
    isGenerating,
    error,
    generateTree,
    selectNode,
    markNodeComplete,
    updateProgress,
    resetProgress,
    navigateToParent,
    navigateToChild,
    navigateToRecommended,
    searchNodes,
    getNodeStats,
    exportTree,
    importTree,
  };
}

// Helper functions
function getNodeDuration(root: VideoTreeNode, nodeId: string): number {
  const node = findNodeById(root, nodeId);
  return node?.duration || 0;
}

function calculateNodeStats(
  node: VideoTreeNode,
  completedVideos: string[]
): NodeStats {
  let totalDuration = node.duration;
  let completedDuration = completedVideos.includes(node.id) ? node.duration : 0;
  let childrenCount = 0;
  let completedChildren = 0;
  
  function traverse(n: VideoTreeNode) {
    n.children.forEach(child => {
      childrenCount++;
      totalDuration += child.duration;
      
      if (completedVideos.includes(child.id)) {
        completedChildren++;
        completedDuration += child.duration;
      }
      
      traverse(child);
    });
  }
  
  traverse(node);
  
  const progressPercentage = totalDuration > 0 
    ? Math.round((completedDuration / totalDuration) * 100)
    : 0;
  
  return {
    totalDuration,
    completedDuration,
    childrenCount,
    completedChildren,
    progressPercentage,
  };
}

// Performance monitoring
export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState({
    renderTime: 0,
    memoryUsage: 0,
    fps: 60,
  });
  
  useEffect(() => {
    const measurePerformance = () => {
      // Measure render time
      const renderStart = performance.now();
      requestAnimationFrame(() => {
        const renderTime = performance.now() - renderStart;
        
        // Get memory usage if available
        const memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;
        
        // Calculate FPS (simplified)
        const fps = Math.round(1000 / Math.max(16.67, renderTime));
        
        setMetrics({
          renderTime,
          memoryUsage: memoryUsage / 1024 / 1024, // Convert to MB
          fps,
        });
      });
    };
    
    const interval = setInterval(measurePerformance, 1000);
    return () => clearInterval(interval);
  }, []);
  
  return metrics;
}