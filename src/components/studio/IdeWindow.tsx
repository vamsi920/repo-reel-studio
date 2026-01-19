import { useEffect, useMemo, useRef } from "react";
import { interpolate, useVideoConfig, Easing, spring } from "remotion";
import { Highlight, themes } from "prism-react-renderer";
import type { HydratedScene } from "@/hooks/useHydrateManifest";

type SceneWithCode = HydratedScene & {
  code?: string;
  file_content?: string;
  fileContents?: string;
};

type FileTreeNode = {
  name: string;
  type: "file" | "folder";
  path?: string;
  children?: FileTreeNode[];
};

const getSceneCode = (scene: SceneWithCode): string => {
  const code = scene.code || scene.file_content || scene.fileContents || "";
  if (code) return code;
  
  // Generate placeholder code if none exists
  return generatePlaceholderCode(scene);
};

const generatePlaceholderCode = (scene: SceneWithCode): string => {
  const filePath = scene.file_path || "unknown.ts";
  const title = scene.title || "Code Section";
  
  if (filePath.endsWith(".md")) {
    return `# ${title}

${scene.narration_text?.slice(0, 200) || "Documentation content..."}

## Overview

This section covers the key aspects of the codebase.
The implementation follows best practices for maintainability.

## Key Points

- Well-structured architecture
- Clean separation of concerns  
- Type-safe implementations
`;
  }

  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
    return `// ${filePath}
// ${title}

import React, { useState, useEffect } from 'react';

/**
 * ${title}
 * ${scene.narration_text?.slice(0, 80) || "Component implementation"}
 */
export const Component = () => {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Initialize component
    initializeData();
    
    return () => {
      // Cleanup on unmount
    };
  }, []);

  const handleAction = async () => {
    try {
      await performAction();
      updateState();
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <div className="container">
      <Header title="${title}" />
      <Content data={state} />
      <ActionButton onPress={handleAction} />
    </div>
  );
};

export default Component;
`;
  }

  if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
    return `// ${filePath}
// ${title}

/**
 * ${scene.narration_text?.slice(0, 80) || "Module implementation"}
 */

// Configuration
const config = {
  apiEndpoint: process.env.API_URL,
  timeout: 30000,
  retries: 3,
};

// Main functionality
export async function execute(params) {
  // Validate input
  validateParams(params);
  
  // Process data
  const processed = await processData(params.data);
  
  // Apply business logic
  const result = applyLogic(processed);
  
  return formatResponse(result);
}

// Helper functions
function validateParams(params) {
  if (!params.data) {
    throw new Error('Missing required data');
  }
}

async function processData(data) {
  // Transform and validate data
  return { ...data, processed: true };
}

export default { execute, config };
`;
  }

  return `// ${filePath}
// ${title}

/*
 * ${scene.narration_text?.slice(0, 120) || "Implementation details"}
 */

// Code content for: ${scene.file_path}
// This file is part of the codebase walkthrough
`;
};

const getLanguageFromPath = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase() || "";
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    css: "css",
    scss: "scss",
    md: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    html: "markup",
    xml: "markup",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
  };
  return languageMap[extension] || "typescript";
};

const buildFileTree = (paths: string[]): FileTreeNode[] => {
  type TreeNode = {
    name: string;
    type: "file" | "folder";
    path?: string;
    children?: Record<string, TreeNode>;
  };

  const root: Record<string, TreeNode> = {};

  paths
    .filter((p) => p && p !== "N/A" && p.length > 0)
    .forEach((path) => {
      const parts = path.split("/").filter(Boolean);
      let cursor = root;
      let accumulatedPath = "";
      
      parts.forEach((part, index) => {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
        const isFile = index === parts.length - 1;
        
        if (!cursor[part]) {
          cursor[part] = {
            name: part,
            type: isFile ? "file" : "folder",
            path: accumulatedPath,
            children: isFile ? undefined : {},
          };
        }
        if (!isFile && cursor[part].children) {
          cursor = cursor[part].children!;
        }
      });
    });

  const toTree = (node: Record<string, TreeNode>): FileTreeNode[] =>
    Object.values(node)
      .sort((a, b) => {
        // Folders first, then alphabetically
        if (a.type === "folder" && b.type === "file") return -1;
        if (a.type === "file" && b.type === "folder") return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) =>
        entry.type === "folder"
          ? {
              name: entry.name,
              type: "folder" as const,
              children: toTree(entry.children ?? {}),
            }
          : {
              name: entry.name,
              type: "file" as const,
              path: entry.path,
            }
      );

  return toTree(root);
};

const flattenTree = (nodes: FileTreeNode[]): FileTreeNode[] =>
  nodes.flatMap((node) =>
    node.type === "folder" && node.children
      ? [node, ...flattenTree(node.children)]
      : [node]
  );

// Get file icon based on extension
const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, { color: string; icon: string }> = {
    ts: { color: '#3178c6', icon: 'TS' },
    tsx: { color: '#61dafb', icon: 'TX' },
    js: { color: '#f7df1e', icon: 'JS' },
    jsx: { color: '#61dafb', icon: 'JX' },
    json: { color: '#cbcb41', icon: '{}' },
    md: { color: '#083fa1', icon: 'MD' },
    css: { color: '#264de4', icon: 'CS' },
    py: { color: '#3776ab', icon: 'PY' },
    go: { color: '#00add8', icon: 'GO' },
  };
  return iconMap[ext || ''] || { color: '#6b7280', icon: '📄' };
};

// File Tree Component with animations
const FileTree = ({
  nodes,
  activePath,
  relativeFrame,
}: {
  nodes: FileTreeNode[];
  activePath: string;
  relativeFrame: number;
}) => {
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeRef.current) return;
    activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activePath]);

  const renderNodes = (items: FileTreeNode[], depth = 0): React.ReactNode[] =>
    items.map((item, itemIndex) => {
      const isActive = item.path === activePath;
      const paddingLeft = depth * 14 + 10;
      const fileIcon = item.type === 'file' ? getFileIcon(item.name) : null;
      
      // Staggered animation for file tree items
      const itemDelay = itemIndex * 2;
      const itemOpacity = interpolate(
        relativeFrame - itemDelay,
        [0, 8],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
      const itemX = interpolate(
        relativeFrame - itemDelay,
        [0, 8],
        [-10, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
      );
      
      return (
        <div 
          key={`${item.name}-${item.path ?? "folder"}-${depth}`}
          style={{
            opacity: itemOpacity,
            transform: `translateX(${itemX}px)`,
          }}
        >
          <div
            ref={isActive ? activeRef : undefined}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 8,
              borderRadius: 8,
              padding: "8px 12px",
              paddingLeft,
              fontSize: 12,
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              backgroundColor: isActive 
                ? "rgba(139, 92, 246, 0.25)" 
                : "transparent",
              color: isActive ? "#e9d5ff" : "#9ca3af",
              cursor: "default",
              border: isActive 
                ? "1px solid rgba(139, 92, 246, 0.4)" 
                : "1px solid transparent",
              fontWeight: isActive ? 600 : 400,
              boxShadow: isActive 
                ? "0 4px 20px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)" 
                : "none",
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Active item glow */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.1), transparent)',
                  pointerEvents: 'none',
                }}
              />
            )}
            
            {item.type === "folder" ? (
              <FolderIcon isOpen={true} />
            ) : fileIcon ? (
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  backgroundColor: `${fileIcon.color}20`,
                  border: `1px solid ${fileIcon.color}40`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8,
                  fontWeight: 700,
                  color: fileIcon.color,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {fileIcon.icon}
              </div>
            ) : (
              <FileIcon />
            )}
            <span style={{ 
              overflow: "hidden", 
              textOverflow: "ellipsis", 
              whiteSpace: "nowrap",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
            }}>
              {item.name}
            </span>
            
            {/* Active indicator dot */}
            {isActive && (
              <div
                style={{
                  marginLeft: 'auto',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#8b5cf6',
                  boxShadow: '0 0 8px rgba(139, 92, 246, 0.8)',
                }}
              />
            )}
          </div>
          {item.type === "folder" && item.children && (
            <div>{renderNodes(item.children, depth + 1)}</div>
          )}
        </div>
      );
    });

  return <div>{renderNodes(nodes)}</div>;
};

// Enhanced SVG icons
const FolderIcon = ({ isOpen = false }: { isOpen?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="folderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
    <path 
      d={isOpen 
        ? "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"
        : "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
      } 
      stroke="url(#folderGrad)" 
      fill="rgba(139, 92, 246, 0.1)"
    />
  </svg>
);

const FileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

// Minimap component
const Minimap = ({
  totalLines,
  highlightLines,
  currentScrollPosition,
}: {
  totalLines: number;
  highlightLines: number[];
  currentScrollPosition: number;
}) => {
  const minimapHeight = 80;
  const lineHeight = minimapHeight / Math.max(totalLines, 1);
  
  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 40,
        height: minimapHeight,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 4,
        border: '1px solid rgba(139, 92, 246, 0.2)',
        overflow: 'hidden',
      }}
    >
      {/* Highlighted area indicator */}
      {highlightLines.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            top: Math.min(...highlightLines) * lineHeight,
            height: (Math.max(...highlightLines) - Math.min(...highlightLines) + 1) * lineHeight,
            backgroundColor: 'rgba(139, 92, 246, 0.4)',
            borderRadius: 2,
          }}
        />
      )}
      
      {/* Current view indicator */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: currentScrollPosition * minimapHeight,
          height: 20,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 2,
        }}
      />
    </div>
  );
};

// Blinking cursor component
const BlinkingCursor = ({ relativeFrame }: { relativeFrame: number }) => {
  const blinkPhase = Math.floor(relativeFrame / 15) % 2;
  
  return (
    <span
      style={{
        display: 'inline-block',
        width: 2,
        height: 16,
        backgroundColor: '#8b5cf6',
        marginLeft: 2,
        opacity: blinkPhase === 0 ? 1 : 0,
        boxShadow: '0 0 8px rgba(139, 92, 246, 0.8)',
        borderRadius: 1,
      }}
    />
  );
};

// Main IDE Window Component
export const IdeWindow = ({
  scenes,
  activeScene,
  previousScene,
  relativeFrame,
}: {
  scenes: HydratedScene[];
  activeScene: HydratedScene;
  previousScene?: HydratedScene;
  relativeFrame: number;
}) => {
  const { height, fps } = useVideoConfig();

  const isFileChange = previousScene && previousScene.file_path !== activeScene.file_path;
  const transitionDuration = Math.min(20, activeScene?.durationInFrames ?? 20);
  
  const transitionProgress = interpolate(
    relativeFrame,
    [0, transitionDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  // Build file tree from all scenes
  const allFiles = useMemo(
    () =>
      Array.from(
        new Set(
          scenes
            .map((scene) => scene.file_path)
            .filter((path): path is string => Boolean(path) && path !== "N/A")
        )
      ),
    [scenes]
  );
  
  const tree = useMemo(() => buildFileTree(allFiles), [allFiles]);
  const flattenedTree = useMemo(() => flattenTree(tree), [tree]);
  
  // Get code content
  const currentCode = getSceneCode(activeScene as SceneWithCode);
  const previousCode = previousScene ? getSceneCode(previousScene as SceneWithCode) : "";
  const codeToRender = currentCode || `// ${activeScene?.file_path ?? "unknown file"}`;

  // Calculate scroll position for highlighted lines
  const highlightLines = activeScene?.highlight_lines ?? [];
  const totalLines = codeToRender.split("\n").length;
  const lineHeight = 24;
  const codePadding = 32;
  
  const highlightCenter =
    highlightLines.length > 0
      ? (Math.min(...highlightLines) + Math.max(...highlightLines)) / 2
      : Math.max(1, Math.min(15, totalLines / 2));
  
  const targetTranslateY = height / 2 - (highlightCenter * lineHeight + codePadding);
  
  // Smooth zoom animation with spring
  const zoomSpring = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  
  const zoomProgress = interpolate(zoomSpring, [0, 1], [1, 1.12]);
  
  // Smooth scroll animation
  const translateY = interpolate(
    relativeFrame, 
    [0, 25], 
    [0, Math.min(0, targetTranslateY)], 
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  // File transition animations - 3D rotation effect
  const rotationY = interpolate(transitionProgress, [0, 1], [-15, 0], { easing: Easing.out(Easing.cubic) });
  const incomingScale = interpolate(transitionProgress, [0, 1], [0.95, 1]);
  const incomingOpacity = interpolate(transitionProgress, [0, 0.3, 1], [0, 0.5, 1]);
  const outgoingRotationY = interpolate(transitionProgress, [0, 1], [0, 15]);
  const outgoingScale = interpolate(transitionProgress, [0, 1], [1, 0.95]);
  const outgoingOpacity = interpolate(transitionProgress, [0, 0.7, 1], [1, 0.5, 0]);

  // Window glow pulse
  const glowPulse = 0.8 + Math.sin(relativeFrame * 0.05) * 0.2;

  // IDE window entrance animation
  const windowScale = interpolate(relativeFrame, [0, 15], [0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.1)),
  });
  
  const windowOpacity = interpolate(relativeFrame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1400,
        borderRadius: 24,
        backgroundColor: "#1a1a1f",
        boxShadow: `
          0 40px 80px -16px rgba(0, 0, 0, 0.7),
          0 0 0 1px rgba(139, 92, 246, ${0.15 * glowPulse}),
          0 0 80px rgba(139, 92, 246, ${0.1 * glowPulse}),
          inset 0 1px 0 rgba(255, 255, 255, 0.06)
        `,
        border: `1px solid rgba(139, 92, 246, ${0.2 * glowPulse})`,
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        position: 'relative',
        transform: `scale(${windowScale})`,
        opacity: windowOpacity,
      }}
    >
      {/* Animated glow border */}
      <div
        style={{
          position: 'absolute',
          top: -2,
          left: -2,
          right: -2,
          height: 4,
          background: `linear-gradient(90deg, 
            transparent 0%, 
            rgba(139, 92, 246, ${0.5 * glowPulse}) 30%,
            rgba(168, 85, 247, ${0.6 * glowPulse}) 50%,
            rgba(139, 92, 246, ${0.5 * glowPulse}) 70%,
            transparent 100%)`,
          borderRadius: '24px 24px 0 0',
          filter: 'blur(1px)',
        }}
      />

      {/* Title Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 22px",
          borderBottom: "1px solid rgba(139, 92, 246, 0.12)",
          background: "linear-gradient(180deg, #252530 0%, #1f1f2a 100%)",
          position: 'relative',
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ 
            height: 13, 
            width: 13, 
            borderRadius: "50%", 
            backgroundColor: "#ff5f57",
            boxShadow: '0 0 10px rgba(255, 95, 87, 0.4)',
            border: '1px solid rgba(255, 95, 87, 0.5)',
          }} />
          <span style={{ 
            height: 13, 
            width: 13, 
            borderRadius: "50%", 
            backgroundColor: "#febc2e",
            boxShadow: '0 0 10px rgba(254, 188, 46, 0.4)',
            border: '1px solid rgba(254, 188, 46, 0.5)',
          }} />
          <span style={{ 
            height: 13, 
            width: 13, 
            borderRadius: "50%", 
            backgroundColor: "#28c840",
            boxShadow: '0 0 10px rgba(40, 200, 64, 0.4)',
            border: '1px solid rgba(40, 200, 64, 0.5)',
          }} />
        </div>
        
        {/* File path with typing effect */}
        <div style={{ 
          fontSize: 13, 
          color: "#e9d5ff", 
          marginLeft: 16,
          fontWeight: 500,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.3px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            padding: '2px 8px',
            borderRadius: 4,
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            fontSize: 10,
            color: '#a78bfa',
          }}>
            {getLanguageFromPath(activeScene?.file_path || '').toUpperCase()}
          </span>
          <span>
            {activeScene?.file_path ?? "Untitled"}
          </span>
          <BlinkingCursor relativeFrame={relativeFrame} />
        </div>
        
        {/* Right side badges */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            padding: '5px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(168, 85, 247, 0.15))',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            fontSize: 10,
            color: '#c4b5fd',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)',
            }} />
            Live
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        display: "flex", 
        height: 620,
        background: 'linear-gradient(180deg, #1a1a1f 0%, #15151a 100%)',
      }}>
        {/* File Explorer Sidebar */}
        <aside
          style={{
            width: 280,
            borderRight: "1px solid rgba(139, 92, 246, 0.1)",
            background: "linear-gradient(180deg, #1a1b20 0%, #15151a 100%)",
            padding: "16px 10px",
            overflow: "hidden",
            position: 'relative',
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#8b5cf6",
              padding: "0 12px",
              marginBottom: 18,
              fontWeight: 700,
              fontFamily: 'system-ui, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Explorer
          </div>
          
          <div style={{ height: 550, overflowY: "auto", paddingRight: 4 }}>
            {tree.length > 0 ? (
              <FileTree 
                nodes={tree} 
                activePath={activeScene?.file_path ?? ""} 
                relativeFrame={relativeFrame}
              />
            ) : (
              <div style={{ padding: 16, color: "#6b7280", fontSize: 12 }}>
                No files to display
              </div>
            )}
          </div>
        </aside>

        {/* Code Editor */}
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          {/* Minimap */}
          <Minimap
            totalLines={totalLines}
            highlightLines={highlightLines}
            currentScrollPosition={Math.abs(translateY) / (totalLines * lineHeight)}
          />
          
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateY(${translateY}px) scale(${zoomProgress})`,
              transformOrigin: "top left",
              perspective: '1000px',
            }}
          >
            <div style={{ position: "absolute", inset: 0, padding: "24px 32px" }}>
              {isFileChange && relativeFrame < transitionDuration ? (
                <>
                  {/* Outgoing code - 3D rotation */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: "24px 32px",
                      transform: `rotateY(${outgoingRotationY}deg) scale(${outgoingScale})`,
                      transformOrigin: 'center center',
                      opacity: outgoingOpacity,
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    <CodeBlock
                      code={previousCode || codeToRender}
                      filePath={previousScene?.file_path ?? ""}
                      highlightLines={previousScene?.highlight_lines ?? []}
                      relativeFrame={relativeFrame}
                      isExiting={true}
                    />
                  </div>
                  {/* Incoming code - 3D rotation */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: "24px 32px",
                      transform: `rotateY(${rotationY}deg) scale(${incomingScale})`,
                      transformOrigin: 'center center',
                      opacity: incomingOpacity,
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    <CodeBlock
                      code={codeToRender}
                      filePath={activeScene?.file_path ?? ""}
                      highlightLines={highlightLines}
                      relativeFrame={relativeFrame}
                      isEntering={true}
                    />
                  </div>
                </>
              ) : (
                <CodeBlock
                  code={codeToRender}
                  filePath={activeScene?.file_path ?? ""}
                  highlightLines={highlightLines}
                  relativeFrame={relativeFrame}
                />
              )}
            </div>
          </div>

          {/* Enhanced fade gradients */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: 80,
              background: "linear-gradient(to left, #1a1a1f, transparent)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 60,
              background: "linear-gradient(to top, #1a1a1f, transparent)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 30,
              background: "linear-gradient(to bottom, #1a1a1f, transparent)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* Enhanced Status Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 22px",
          borderTop: "1px solid rgba(139, 92, 246, 0.1)",
          background: "linear-gradient(180deg, #1f1f2a 0%, #1a1a1f 100%)",
          fontSize: 11,
          color: "#9ca3af",
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            color: '#e9d5ff',
            fontWeight: 500,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#8b5cf6',
              boxShadow: '0 0 8px rgba(139, 92, 246, 0.6)',
            }} />
            Scene {scenes.findIndex((scene) => scene === activeScene) + 1} of {scenes.length}
          </div>
          
          <div style={{ 
            width: 1, 
            height: 16, 
            background: 'rgba(139, 92, 246, 0.2)' 
          }} />
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {flattenedTree.filter(n => n.type === 'file').length} files
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Ln {Math.min(...(highlightLines.length > 0 ? highlightLines : [1]))}, Col 1
          </div>
        </div>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          color: '#a78bfa',
          fontWeight: 500,
        }}>
          <span style={{
            padding: '3px 10px',
            borderRadius: 6,
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            fontSize: 10,
          }}>
            {getLanguageFromPath(activeScene?.file_path || '')}
          </span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
};

// Code Block with Syntax Highlighting and animations
const CodeBlock = ({
  code,
  filePath,
  highlightLines,
  relativeFrame,
  isEntering = false,
  isExiting = false,
}: {
  code: string;
  filePath: string;
  highlightLines: number[];
  relativeFrame: number;
  isEntering?: boolean;
  isExiting?: boolean;
}) => {
  const language = getLanguageFromPath(filePath);

  // Expand highlight lines if it's a range [start, end]
  const expandedLines = useMemo(() => {
    if (!highlightLines || highlightLines.length === 0) return null;
    if (highlightLines.length === 2) {
      const [start, end] = highlightLines;
      const lines = new Set<number>();
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        lines.add(i);
      }
      return lines;
    }
    return new Set(highlightLines);
  }, [highlightLines]);

  // Line reveal animation
  const getLineAnimation = (lineIndex: number, isHighlighted: boolean) => {
    if (isExiting) return { opacity: 1, x: 0 };
    
    const delay = isEntering ? lineIndex * 0.5 : lineIndex * 0.3;
    const startFrame = isHighlighted ? delay : delay + 5;
    
    const opacity = interpolate(
      relativeFrame - startFrame,
      [0, 8],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    
    const x = interpolate(
      relativeFrame - startFrame,
      [0, 10],
      [isHighlighted ? -20 : -5, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
    );
    
    return { opacity, x };
  };

  // Spotlight effect intensity
  const spotlightIntensity = interpolate(
    relativeFrame,
    [10, 25],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div style={{ position: 'relative' }}>
      {/* Spotlight glow behind highlighted lines */}
      {expandedLines && expandedLines.size > 0 && (
        <div
          style={{
            position: 'absolute',
            left: -20,
            right: -20,
            top: (Math.min(...Array.from(expandedLines)) - 1) * 24,
            height: expandedLines.size * 24 + 16,
            background: `radial-gradient(ellipse at center, rgba(139, 92, 246, ${0.15 * spotlightIntensity}) 0%, transparent 70%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
            transform: 'translateY(-8px)',
          }}
        />
      )}
      
      <Highlight theme={themes.vsDark} code={code} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{
              fontSize: 14,
              lineHeight: "24px",
              fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              color: "rgba(255, 255, 255, 0.95)",
              margin: 0,
              padding: 0,
              background: "transparent",
            }}
          >
            {tokens.map((line, index) => {
              const lineNumber = index + 1;
              const isHighlighted = expandedLines === null || expandedLines.has(lineNumber);
              const { opacity, x } = getLineAnimation(index, isHighlighted);
              
              return (
                <div
                  key={`line-${index}`}
                  {...getLineProps({ line })}
                  style={{
                    display: "flex",
                    gap: 20,
                    opacity: isHighlighted ? opacity : opacity * 0.3,
                    transform: `translateX(${x}px)`,
                    backgroundColor: isHighlighted 
                      ? `rgba(139, 92, 246, ${0.12 * spotlightIntensity})` 
                      : "transparent",
                    padding: "3px 0",
                    borderRadius: 6,
                    marginLeft: isHighlighted ? -12 : 0,
                    paddingLeft: isHighlighted ? 12 : 0,
                    paddingRight: isHighlighted ? 12 : 0,
                    borderLeft: isHighlighted 
                      ? `4px solid rgba(139, 92, 246, ${0.7 * spotlightIntensity})` 
                      : "4px solid transparent",
                    transition: 'background-color 0.3s ease',
                  }}
                >
                  <span
                    style={{
                      width: 48,
                      textAlign: "right",
                      color: isHighlighted 
                        ? `rgba(196, 181, 253, ${0.7 * spotlightIntensity})` 
                        : "rgba(255, 255, 255, 0.2)",
                      userSelect: "none",
                      flexShrink: 0,
                      fontWeight: isHighlighted ? 600 : 400,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                    }}
                  >
                    {lineNumber}
                  </span>
                  <span style={{ 
                    flex: 1,
                    filter: isHighlighted ? "none" : "blur(0.3px)",
                  }}>
                    {line.map((token, key) => {
                      const tokenProps = getTokenProps({ token });
                      return (
                        <span 
                          key={key} 
                          {...tokenProps}
                          style={{
                            ...tokenProps.style,
                            textShadow: isHighlighted 
                              ? `0 0 8px rgba(139, 92, 246, ${0.4 * spotlightIntensity})` 
                              : "none",
                          }}
                        />
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
};
