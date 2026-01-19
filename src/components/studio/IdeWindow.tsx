import { useEffect, useMemo, useRef } from "react";
import { interpolate, useVideoConfig } from "remotion";
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

// File Tree Component with inline styles for Remotion compatibility
const FileTree = ({
  nodes,
  activePath,
}: {
  nodes: FileTreeNode[];
  activePath: string;
}) => {
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeRef.current) return;
    activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activePath]);

  const renderNodes = (items: FileTreeNode[], depth = 0): React.ReactNode[] =>
    items.map((item) => {
      const isActive = item.path === activePath;
      const paddingLeft = depth * 12 + 8;
      
      return (
        <div key={`${item.name}-${item.path ?? "folder"}-${depth}`}>
          <div
            ref={isActive ? activeRef : undefined}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 8,
              borderRadius: 6,
              padding: "7px 10px",
              paddingLeft,
              fontSize: 12,
              transition: "all 0.2s ease",
              backgroundColor: isActive 
                ? "rgba(139, 92, 246, 0.25)" 
                : "transparent",
              color: isActive ? "#c4b5fd" : "#9ca3af",
              cursor: "default",
              border: isActive 
                ? "1px solid rgba(139, 92, 246, 0.3)" 
                : "1px solid transparent",
              fontWeight: isActive ? 600 : 400,
              boxShadow: isActive 
                ? "0 2px 8px rgba(139, 92, 246, 0.2)" 
                : "none",
            }}
          >
            {item.type === "folder" ? (
              <FolderIcon />
            ) : (
              <FileIcon />
            )}
            <span style={{ 
              overflow: "hidden", 
              textOverflow: "ellipsis", 
              whiteSpace: "nowrap",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}>
              {item.name}
            </span>
          </div>
          {item.type === "folder" && item.children && (
            <div>{renderNodes(item.children, depth + 1)}</div>
          )}
        </div>
      );
    });

  return <div>{renderNodes(nodes)}</div>;
};

// Enhanced SVG icons for file tree
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

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
  const { height } = useVideoConfig();

  const isFileChange = previousScene && previousScene.file_path !== activeScene.file_path;
  const transitionDuration = Math.min(15, activeScene?.durationInFrames ?? 15);
  
  const transitionProgress = interpolate(
    relativeFrame,
    [0, transitionDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
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
  const lineHeight = 22;
  const codePadding = 32;
  
  const highlightCenter =
    highlightLines.length > 0
      ? (Math.min(...highlightLines) + Math.max(...highlightLines)) / 2
      : Math.max(1, Math.min(15, totalLines / 2));
  
  const targetTranslateY = height / 2 - (highlightCenter * lineHeight + codePadding);
  
  // Smooth zoom and scroll animation
  const zoomProgress = interpolate(relativeFrame, [0, 15], [1, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  const translateY = interpolate(relativeFrame, [0, 15], [0, Math.min(0, targetTranslateY)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // File transition animations
  const incomingX = interpolate(transitionProgress, [0, 1], [100, 0]);
  const outgoingX = interpolate(transitionProgress, [0, 1], [0, -100]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1400,
        borderRadius: 20,
        backgroundColor: "#1a1a1f",
        boxShadow: `
          0 32px 64px -12px rgba(0, 0, 0, 0.6),
          0 0 0 1px rgba(139, 92, 246, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.05)
        `,
        border: "1px solid rgba(139, 92, 246, 0.15)",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        position: 'relative',
      }}
    >
      {/* Subtle glow effect */}
      <div
        style={{
          position: 'absolute',
          top: -2,
          left: -2,
          right: -2,
          height: 4,
          background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.4), transparent)',
          borderRadius: '20px 20px 0 0',
        }}
      />

      {/* Title Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 20px",
          borderBottom: "1px solid rgba(139, 92, 246, 0.1)",
          background: "linear-gradient(180deg, #252530 0%, #1f1f2a 100%)",
          position: 'relative',
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ 
            height: 12, 
            width: 12, 
            borderRadius: "50%", 
            backgroundColor: "#ff5f57",
            boxShadow: '0 0 8px rgba(255, 95, 87, 0.3)',
          }} />
          <span style={{ 
            height: 12, 
            width: 12, 
            borderRadius: "50%", 
            backgroundColor: "#febc2e",
            boxShadow: '0 0 8px rgba(254, 188, 46, 0.3)',
          }} />
          <span style={{ 
            height: 12, 
            width: 12, 
            borderRadius: "50%", 
            backgroundColor: "#28c840",
            boxShadow: '0 0 8px rgba(40, 200, 64, 0.3)',
          }} />
        </div>
        <div style={{ 
          fontSize: 13, 
          color: "#c4b5fd", 
          marginLeft: 12,
          fontWeight: 500,
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.3px',
        }}>
          {activeScene?.file_path ?? "Untitled"}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            fontSize: 10,
            color: '#a78bfa',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            AI Generated
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        display: "flex", 
        height: 600,
        background: 'linear-gradient(180deg, #1a1a1f 0%, #15151a 100%)',
      }}>
        {/* File Explorer Sidebar */}
        <aside
          style={{
            width: 280,
            borderRight: "1px solid rgba(139, 92, 246, 0.1)",
            background: "linear-gradient(180deg, #1a1b20 0%, #15151a 100%)",
            padding: "16px 12px",
            overflow: "hidden",
            position: 'relative',
          }}
        >
          {/* Subtle accent line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent)',
            }}
          />
          
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#8b5cf6",
              padding: "0 12px",
              marginBottom: 16,
              fontWeight: 600,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            📁 Explorer
          </div>
          <div style={{ height: 540, overflowY: "auto", paddingRight: 4 }}>
            {tree.length > 0 ? (
              <FileTree nodes={tree} activePath={activeScene?.file_path ?? ""} />
            ) : (
              <div style={{ padding: 16, color: "#6b7280", fontSize: 12 }}>
                No files to display
              </div>
            )}
          </div>
        </aside>

        {/* Code Editor */}
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateY(${translateY}px) scale(${zoomProgress})`,
              transformOrigin: "top left",
            }}
          >
            <div style={{ position: "absolute", inset: 0, padding: "24px 32px" }}>
              {isFileChange && relativeFrame < transitionDuration ? (
                <>
                  {/* Outgoing code */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: "24px 32px",
                      transform: `translateX(${outgoingX}%)`,
                      opacity: 1 - transitionProgress,
                    }}
                  >
                    <CodeBlock
                      code={previousCode || codeToRender}
                      filePath={previousScene?.file_path ?? ""}
                      highlightLines={previousScene?.highlight_lines ?? []}
                    />
                  </div>
                  {/* Incoming code */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: "24px 32px",
                      transform: `translateX(${incomingX}%)`,
                      opacity: transitionProgress,
                    }}
                  >
                    <CodeBlock
                      code={codeToRender}
                      filePath={activeScene?.file_path ?? ""}
                      highlightLines={highlightLines}
                    />
                  </div>
                </>
              ) : (
                <CodeBlock
                  code={codeToRender}
                  filePath={activeScene?.file_path ?? ""}
                  highlightLines={highlightLines}
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
              width: 60,
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
              height: 40,
              background: "linear-gradient(to top, #1a1a1f, transparent)",
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
          padding: "10px 20px",
          borderTop: "1px solid rgba(139, 92, 246, 0.1)",
          background: "linear-gradient(180deg, #1f1f2a 0%, #1a1a1f 100%)",
          fontSize: 11,
          color: "#9ca3af",
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            color: '#c4b5fd',
            fontWeight: 500,
          }}>
            <span>🎬</span>
            <span>Scene {scenes.findIndex((scene) => scene === activeScene) + 1} of {scenes.length}</span>
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
            <span>📄</span>
            <span>{flattenedTree.filter(n => n.type === 'file').length} files</span>
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          color: '#8b5cf6',
          fontWeight: 500,
        }}>
          <span>✨</span>
          <span>AI Generated</span>
        </div>
      </div>
    </div>
  );
};

// Code Block with Syntax Highlighting
const CodeBlock = ({
  code,
  filePath,
  highlightLines,
}: {
  code: string;
  filePath: string;
  highlightLines: number[];
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

  return (
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
            
            return (
              <div
                key={`line-${index}`}
                {...getLineProps({ line })}
                style={{
                  display: "flex",
                  gap: 20,
                  opacity: isHighlighted ? 1 : 0.25,
                  transition: "all 0.3s ease",
                  backgroundColor: isHighlighted 
                    ? "rgba(139, 92, 246, 0.1)" 
                    : "transparent",
                  padding: "2px 0",
                  borderRadius: 4,
                  marginLeft: isHighlighted ? -8 : 0,
                  paddingLeft: isHighlighted ? 8 : 0,
                  borderLeft: isHighlighted 
                    ? "3px solid rgba(139, 92, 246, 0.6)" 
                    : "3px solid transparent",
                }}
              >
                <span
                  style={{
                    width: 48,
                    textAlign: "right",
                    color: isHighlighted 
                      ? "rgba(196, 181, 253, 0.6)" 
                      : "rgba(255, 255, 255, 0.2)",
                    userSelect: "none",
                    flexShrink: 0,
                    fontWeight: isHighlighted ? 600 : 400,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {lineNumber}
                </span>
                <span style={{ 
                  flex: 1,
                  filter: isHighlighted ? "none" : "blur(0.5px)",
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
                            ? "0 0 4px rgba(139, 92, 246, 0.3)" 
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
  );
};
