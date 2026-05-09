import type { VideoManifest, VideoScene } from "@/lib/types";

export function generatePlaceholderCode(scene: VideoScene): string {
  const filePath = scene.file_path || "unknown";
  const title = scene.title || "Code Section";

  if (filePath.endsWith(".md")) {
    return `# ${title}

${scene.narration_text?.slice(0, 200) || "Documentation content..."}

## Overview

This section covers the key aspects of the ${title.toLowerCase()}.
The implementation follows best practices for maintainability and scalability.

## Key Points

- Well-structured codebase architecture
- Clean separation of concerns  
- Comprehensive documentation
- Type-safe implementations
`;
  }

  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
    return `// ${filePath}
// ${title}

import React from 'react';

/**
 * ${title}
 * ${scene.narration_text?.slice(0, 100) || "Component implementation"}
 */
export const Component = () => {
  // State management
  const [state, setState] = useState(initialState);
  
  // Effects and lifecycle
  useEffect(() => {
    // Initialize component
    initializeData();
    
    return () => {
      // Cleanup
    };
  }, [dependencies]);

  // Event handlers
  const handleAction = async () => {
    try {
      await performAction();
      updateState();
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="${title}" />
      <Content data={state.data} />
      <ActionButton onPress={handleAction} />
    </View>
  );
};
`;
  }

  if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
    return `// ${filePath}
// ${title}

/**
 * ${scene.narration_text?.slice(0, 100) || "Module implementation"}
 */

// Configuration
const config = {
  apiEndpoint: process.env.API_URL,
  timeout: 30000,
  retries: 3,
};

// Main functionality
export async function execute(params: ExecuteParams) {
  // Validate input
  validateParams(params);
  
  // Process data
  const processed = await processData(params.data);
  
  // Apply business logic
  const result = applyLogic(processed);
  
  // Return formatted response
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
  return transformedData;
}

function applyLogic(data) {
  // Core business logic
  return processedResult;
}

export default { execute, config };
`;
  }

  return `// ${filePath}
// ${title}

/*
 * ${scene.narration_text?.slice(0, 150) || "Implementation details"}
 */

// Code content for: ${scene.file_path}
// This file is part of the codebase walkthrough
`;
}

export function enrichManifestWithCode(
  manifest: VideoManifest,
  fileContents: Record<string, string>
): VideoManifest {
  const repoFiles = Object.keys(fileContents);
  const resolvedRepoFiles = repoFiles.length > 0 ? repoFiles : manifest.repo_files || [];
  const normalizePath = (value: string) => value.replace(/^\.\/+/, "").replace(/^\/+/, "");
  const normalizedContents = new Map<string, string>(
    Object.entries(fileContents).map(([path, contents]) => [normalizePath(path), contents])
  );

  const lookupCode = (filePath?: string): string | undefined => {
    if (!filePath) return undefined;
    if (fileContents[filePath]) return fileContents[filePath];
    const normalizedPath = normalizePath(filePath);
    if (normalizedContents.has(normalizedPath)) return normalizedContents.get(normalizedPath);
    const suffixMatch = Object.keys(fileContents).find((path) =>
      normalizePath(path).endsWith(`/${normalizedPath}`)
    );
    if (suffixMatch) return fileContents[suffixMatch];
    const base = normalizedPath.split("/").pop() || "";
    if (base) {
      const basenameMatches = Object.keys(fileContents).filter(
        (path) => normalizePath(path).split("/").pop() === base
      );
      if (basenameMatches.length === 1) return fileContents[basenameMatches[0]];
    }
    const containsMatches = Object.keys(fileContents).filter((path) => {
      const np = normalizePath(path);
      return np.includes(normalizedPath) || normalizedPath.includes(np);
    });
    if (containsMatches.length === 1) return fileContents[containsMatches[0]];
    return undefined;
  };

  return {
    ...manifest,
    repo_files: resolvedRepoFiles,
    scenes: manifest.scenes.map((scene) => {
      const actualCode = lookupCode(scene.file_path);
      const trimmedActual = actualCode?.trim();
      const trimmedExisting = scene.code?.trim();

      const usePlaceholder = !trimmedActual && !trimmedExisting;
      const code = trimmedActual
        ? actualCode
        : trimmedExisting
          ? scene.code
          : generatePlaceholderCode(scene);

      return {
        ...scene,
        code,
        ...(usePlaceholder ? { highlight_lines: [1, 5] as [number, number] } : {}),
      };
    }),
  };
}
