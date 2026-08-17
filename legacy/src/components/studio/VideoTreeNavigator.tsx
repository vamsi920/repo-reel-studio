import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Lock,
  CheckCircle2,
  Clock,
  ChevronRight,
  Search,
  Filter,
  Zap,
  BookOpen,
  Code2,
  Layers,
  Target,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  VideoTree,
  VideoTreeNode,
  VideoNodeType,
  VideoDifficulty,
  UserVideoProgress,
} from "@/lib/types";

interface Props {
  tree: VideoTree;
  currentNodeId?: string;
  userProgress?: UserVideoProgress;
  onNodeSelect: (node: VideoTreeNode) => void;
  onNodePreview?: (node: VideoTreeNode) => void;
}

const NODE_TYPE_ICONS: Record<VideoNodeType, React.ElementType> = {
  master: Layers,
  category: BookOpen,
  feature: Zap,
  "deep-dive": Target,
  concept: Code2,
};

const NODE_TYPE_COLORS: Record<VideoNodeType, string> = {
  master: "bg-primary/20 text-primary border-primary/30",
  category: "bg-emerald-100 text-emerald-700 border-emerald-200",
  feature: "bg-amber-100 text-amber-700 border-amber-200",
  "deep-dive": "bg-rose-100 text-rose-700 border-rose-200",
  concept: "bg-violet-100 text-violet-700 border-violet-200",
};

const DIFFICULTY_BADGES: Record<VideoDifficulty, { color: string; label: string }> = {
  beginner: { color: "bg-emerald-100 text-emerald-700", label: "Beginner" },
  intermediate: { color: "bg-amber-100 text-amber-700", label: "Intermediate" },
  advanced: { color: "bg-rose-100 text-rose-700", label: "Advanced" },
};

interface TreeNodeComponentProps {
  node: VideoTreeNode;
  level: number;
  isSelected: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  progress?: number;
  onSelect: (node: VideoTreeNode) => void;
  onPreview?: (node: VideoTreeNode) => void;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
}

function TreeNodeComponent({
  node,
  level,
  isSelected,
  isCompleted,
  isLocked,
  progress = 0,
  onSelect,
  onPreview,
  expandedNodes,
  onToggleExpand,
}: TreeNodeComponentProps) {
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const Icon = NODE_TYPE_ICONS[node.type];
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  return (
    <div className="select-none">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: level * 0.05 }}
        className={cn(
          "group relative rounded-xl border transition-all cursor-pointer",
          isSelected
            ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(104,132,255,0.2)]"
            : isHovered
            ? "bg-muted border-border"
            : "bg-card border-border hover:bg-muted",
          isLocked && "opacity-50 cursor-not-allowed"
        )}
        style={{ marginLeft: `${level * 24}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => !isLocked && onSelect(node)}
      >
        <div className="flex items-center gap-3 p-4">
          {/* Expand/Collapse button */}
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="flex-shrink-0 p-1 rounded-lg hover:bg-muted transition"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
          )}
          
          {/* Node icon */}
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
            NODE_TYPE_COLORS[node.type]
          )}>
            {isLocked ? (
              <Lock className="h-5 w-5" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Icon className="h-5 w-5" />
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {node.title}
              </h3>
              {node.difficulty && (
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full",
                  DIFFICULTY_BADGES[node.difficulty].color
                )}>
                  {DIFFICULTY_BADGES[node.difficulty].label}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {node.description}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(node.duration)}
              </span>
              {node.concepts && node.concepts.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {node.concepts.length} concepts
                </span>
              )}
              {progress > 0 && (
                <div className="flex items-center gap-1">
                  <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{progress}%</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
            {onPreview && !isLocked && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(node);
                }}
                className="p-2 rounded-lg bg-muted hover:bg-black/[0.06] transition"
                title="Preview"
              >
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        
        {/* Progress bar */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted rounded-b-xl overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}
      </motion.div>
      
      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-2">
          {node.children.map((child) => (
            <div key={child.id} className="mt-2">
              <TreeNodeComponent
                node={child}
                level={level + 1}
                isSelected={false}
                isCompleted={userProgress?.completedVideos.includes(child.id) || false}
                isLocked={child.isLocked || false}
                progress={0}
                onSelect={onSelect}
                onPreview={onPreview}
                expandedNodes={expandedNodes}
                onToggleExpand={onToggleExpand}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const VideoTreeNavigator = ({
  tree,
  currentNodeId,
  userProgress,
  onNodeSelect,
  onNodePreview,
}: Props) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<VideoDifficulty | null>(null);
  const [selectedType, setSelectedType] = useState<VideoNodeType | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([tree.root.id]));
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showRecommended, setShowRecommended] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);
  
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.1, 2));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.1, 0.5));
  const handleZoomReset = () => setZoomLevel(1);
  
  // Filter nodes based on search and filters
  const filteredTree = useMemo(() => {
    if (!searchQuery && !selectedDifficulty && !selectedType) {
      return tree.root;
    }
    
    const filterNode = (node: VideoTreeNode): VideoTreeNode | null => {
      const matchesSearch = !searchQuery ||
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesDifficulty = !selectedDifficulty || node.difficulty === selectedDifficulty;
      const matchesType = !selectedType || node.type === selectedType;
      
      const filteredChildren = node.children
        .map(child => filterNode(child))
        .filter(Boolean) as VideoTreeNode[];
      
      if (matchesSearch && matchesDifficulty && matchesType) {
        return { ...node, children: filteredChildren };
      }
      
      if (filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      
      return null;
    };
    
    return filterNode(tree.root) || tree.root;
  }, [tree.root, searchQuery, selectedDifficulty, selectedType]);
  
  // Get recommended path
  const recommendedNodes = useMemo(() => {
    if (!userProgress?.recommendedPath) return [];
    return userProgress.recommendedPath
      .map(nodeId => findNodeInTree(tree.root, nodeId))
      .filter(Boolean) as VideoTreeNode[];
  }, [tree.root, userProgress]);
  
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Video Tree</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg bg-muted hover:bg-black/[0.06] transition"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={handleZoomReset}
              className="p-1.5 rounded-lg bg-muted hover:bg-black/[0.06] transition"
              title="Reset zoom"
            >
              <Maximize2 className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg bg-muted hover:bg-black/[0.06] transition"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-card transition"
          />
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowRecommended(!showRecommended)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5",
              showRecommended
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground hover:bg-black/[0.06]"
            )}
          >
            <Star className="h-3.5 w-3.5" />
            Recommended
          </button>
          
          {/* Difficulty filter */}
          <div className="flex items-center gap-1">
            {Object.entries(DIFFICULTY_BADGES).map(([key, badge]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDifficulty(
                  selectedDifficulty === key ? null : key as VideoDifficulty
                )}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition",
                  selectedDifficulty === key
                    ? badge.color
                    : "bg-muted text-muted-foreground hover:bg-black/[0.06]"
                )}
              >
                {badge.label}
              </button>
            ))}
          </div>
          
          {/* Type filter */}
          <div className="flex items-center gap-1">
            {Object.entries(NODE_TYPE_ICONS).map(([type, Icon]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(
                  selectedType === type ? null : type as VideoNodeType
                )}
                className={cn(
                  "p-1.5 rounded-lg transition",
                  selectedType === type
                    ? NODE_TYPE_COLORS[type as VideoNodeType]
                    : "bg-muted text-muted-foreground hover:bg-black/[0.06]"
                )}
                title={type}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="px-4 py-3 bg-muted border-b border-border">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              {tree.totalVideos} videos
            </span>
            <span className="text-muted-foreground">
              {Math.floor(tree.totalDuration / 60)} minutes
            </span>
            {userProgress && (
              <span className="text-primary">
                {userProgress.completedVideos.length} completed
              </span>
            )}
          </div>
          {userProgress && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Progress</span>
              <div className="w-24 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${(userProgress.completedVideos.length / tree.totalVideos) * 100}%`,
                  }}
                />
              </div>
              <span className="text-foreground">
                {Math.round((userProgress.completedVideos.length / tree.totalVideos) * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Tree view */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4"
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: "top left",
        }}
      >
        {showRecommended && recommendedNodes.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              Recommended Path
            </h3>
            <div className="space-y-2">
              {recommendedNodes.map((node) => (
                <TreeNodeComponent
                  key={node.id}
                  node={node}
                  level={0}
                  isSelected={node.id === currentNodeId}
                  isCompleted={userProgress?.completedVideos.includes(node.id) || false}
                  isLocked={node.isLocked || false}
                  onSelect={onNodeSelect}
                  onPreview={onNodePreview}
                  expandedNodes={expandedNodes}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
            <div className="my-4 border-t border-border" />
          </div>
        )}
        
        <TreeNodeComponent
          node={filteredTree}
          level={0}
          isSelected={filteredTree.id === currentNodeId}
          isCompleted={userProgress?.completedVideos.includes(filteredTree.id) || false}
          isLocked={filteredTree.isLocked || false}
          progress={
            filteredTree.id === userProgress?.currentVideo
              ? 50 // Example progress
              : 0
          }
          onSelect={onNodeSelect}
          onPreview={onNodePreview}
          expandedNodes={expandedNodes}
          onToggleExpand={handleToggleExpand}
        />
      </div>
    </div>
  );
};

// Helper function to find node in tree
function findNodeInTree(root: VideoTreeNode, nodeId: string): VideoTreeNode | null {
  if (root.id === nodeId) return root;
  
  for (const child of root.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  
  return null;
}