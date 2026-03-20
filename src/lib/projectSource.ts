export interface FolderUploadFile {
  path: string;
  content: string;
}

export interface FolderUploadPayload {
  files: FolderUploadFile[];
  folderName: string;
  repoName: string;
  repoUrl: string;
  fingerprint: string;
}

export const FOLDER_UPLOAD_STORAGE_KEY = "folder-upload";

const IGNORED_UPLOAD_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  ".output",
  "out",
  "venv",
  ".venv",
  "__pycache__",
  "vendor",
  "third_party",
  "target",
  "tmp",
  ".idea",
  ".vscode",
  ".DS_Store",
  ".env.local",
]);

const ALLOWED_UPLOAD_EXTS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".mdx",
  ".txt",
  ".sh",
  ".bash",
  ".sql",
  ".graphql",
  ".gql",
]);

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function inferFolderName(relativePath: string, fallbackName: string) {
  const firstSegment = relativePath.split("/").filter(Boolean)[0];
  return firstSegment || fallbackName;
}

function isIgnoredPath(relativePath: string) {
  return relativePath
    .split("/")
    .filter(Boolean)
    .some((segment) => IGNORED_UPLOAD_DIRS.has(segment));
}

function hasAllowedExt(fileName: string) {
  const suffix = fileName.includes(".")
    ? `.${fileName.split(".").pop()?.toLowerCase()}`
    : "";
  return ALLOWED_UPLOAD_EXTS.has(suffix);
}

export function extractRepoNameFromSource(repoUrl: string): string {
  if (!repoUrl) return "";

  try {
    const parsed = new URL(repoUrl);

    if (parsed.protocol === "local:") {
      return parsed.searchParams.get("name") || "Uploaded folder";
    }

    if (GITHUB_HOSTS.has(parsed.hostname)) {
      const [owner, repo] = parsed.pathname
        .split("/")
        .filter(Boolean)
        .slice(0, 2)
        .map((segment) => segment.replace(/\.git$/i, ""));

      if (owner && repo) {
        return `${owner}/${repo}`;
      }
    }

    return trimTrailingSlash(`${parsed.hostname}${parsed.pathname}`);
  } catch {
    return repoUrl;
  }
}

export function resolveRepoSourceFromInput(rawInput: string): {
  repoUrl: string;
  repoName: string;
} {
  let candidate = rawInput.trim();

  if (!candidate) {
    throw new Error("Please enter a GitHub repository URL.");
  }

  if (/^[\w-]+\/[\w.-]+$/.test(candidate)) {
    candidate = `https://github.com/${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("URL must use http or https protocol.");
  }

  parsed.hash = "";
  parsed.search = "";

  if (GITHUB_HOSTS.has(parsed.hostname)) {
    const [owner, repoPart] = parsed.pathname.split("/").filter(Boolean);
    const repo = repoPart?.replace(/\.git$/i, "");

    if (!owner || !repo) {
      throw new Error(
        "Invalid GitHub repository URL. Expected format: github.com/user/repo"
      );
    }

    const repoUrl = `https://github.com/${owner}/${repo}`;
    return {
      repoUrl,
      repoName: `${owner}/${repo}`,
    };
  }

  const cleanPath = trimTrailingSlash(parsed.pathname);
  const repoUrl = `${parsed.protocol}//${parsed.host}${cleanPath}`;
  return {
    repoUrl,
    repoName: extractRepoNameFromSource(repoUrl),
  };
}

export function buildFolderProjectSource(
  folderName: string,
  files: FolderUploadFile[]
): {
  repoUrl: string;
  repoName: string;
  fingerprint: string;
} {
  const digest = files
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}:${hashString(file.content)}`)
    .join("|");

  const fingerprint = hashString(
    `${folderName}|${files.length}|${hashString(digest)}`
  );

  return {
    repoName: folderName,
    repoUrl: `local://folder?name=${encodeURIComponent(
      folderName
    )}&fingerprint=${fingerprint}`,
    fingerprint,
  };
}

export function getProjectSourceType(repoUrl?: string | null) {
  if (!repoUrl) return "unknown" as const;

  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol === "local:") return "folder" as const;
    if (GITHUB_HOSTS.has(parsed.hostname)) return "github" as const;
    return "url" as const;
  } catch {
    return "unknown" as const;
  }
}

export async function buildFolderUploadPayload(
  files: FileList | File[],
  fallbackFolderName = "uploaded-folder"
): Promise<FolderUploadPayload> {
  const readableFiles: FolderUploadFile[] = [];
  let folderName = fallbackFolderName;

  for (const file of Array.from(files)) {
    const relativePath =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;

    if (readableFiles.length === 0) {
      folderName = inferFolderName(relativePath, fallbackFolderName);
    }

    if (isIgnoredPath(relativePath)) continue;
    if (!hasAllowedExt(file.name)) continue;
    if (file.size > 512 * 1024) continue;

    try {
      const content = await file.text();
      readableFiles.push({ path: relativePath, content });
    } catch {
      // Ignore unreadable files.
    }
  }

  if (readableFiles.length === 0) {
    throw new Error(
      "No supported source files found in the uploaded folder."
    );
  }

  const { repoUrl, repoName, fingerprint } = buildFolderProjectSource(
    folderName,
    readableFiles
  );

  return {
    files: readableFiles,
    folderName,
    repoName,
    repoUrl,
    fingerprint,
  };
}

export function saveFolderUploadSession(payload: FolderUploadPayload) {
  sessionStorage.setItem(FOLDER_UPLOAD_STORAGE_KEY, JSON.stringify(payload));
}

export function loadFolderUploadSession(): FolderUploadPayload | null {
  try {
    const raw = sessionStorage.getItem(FOLDER_UPLOAD_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as
      | FolderUploadPayload
      | { files: FolderUploadFile[]; folderName?: string };

    if ("repoUrl" in parsed && "repoName" in parsed && "fingerprint" in parsed) {
      return parsed;
    }

    const folderName = parsed.folderName || "uploaded-folder";
    const { repoUrl, repoName, fingerprint } = buildFolderProjectSource(
      folderName,
      parsed.files || []
    );

    return {
      files: parsed.files || [],
      folderName,
      repoUrl,
      repoName,
      fingerprint,
    };
  } catch {
    return null;
  }
}

export function clearFolderUploadSession() {
  sessionStorage.removeItem(FOLDER_UPLOAD_STORAGE_KEY);
}
