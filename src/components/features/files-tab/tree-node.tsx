import { useEffect, useState } from "react";

import FileIcon from "#/icons/file.svg?react";
import FolderIcon from "#/icons/folder.svg?react";
import { FileTreeNode } from "#/utils/file-tree";
import { cn } from "#/utils/utils";

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

// True when `path` is `node.path` itself or lives somewhere under it.
function containsPath(node: FileTreeNode, path: string | null): boolean {
  if (!path) return false;
  return path === node.path || path.startsWith(`${node.path}/`);
}

export function TreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: TreeNodeProps) {
  const holdsSelection = node.isDirectory && containsPath(node, selectedPath);
  const [isOpen, setIsOpen] = useState(holdsSelection);

  // Reveal the selected file the moment it lands inside this directory —
  // the initial `useState` above only covers the first render, but a
  // selection made after mount (auto-select-on-load, or the canvas_ui tool
  // dispatcher driving `useFilesTabStore` directly) must still open every
  // ancestor folder, not just highlight a row that's hidden behind a
  // collapsed parent. Never forces a directory closed: a user who
  // collapses it back keeps that choice even while it still holds the
  // selection.
  useEffect(() => {
    if (holdsSelection) setIsOpen(true);
  }, [holdsSelection]);

  const indentPx = 8 + depth * 12;

  if (node.isDirectory) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          data-testid={`file-tree-dir-${node.path}`}
          className={cn(
            "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm text-white",
            "hover:bg-tertiary cursor-pointer",
          )}
          // per-row indentation computed from tree depth at runtime
          style={{ paddingLeft: `${indentPx}px` }}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block w-3 text-[10px] text-[var(--oh-muted)] transition-transform",
              isOpen ? "rotate-90" : "rotate-0",
            )}
          >
            ▶
          </span>
          <FolderIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        aria-current={isSelected ? "true" : undefined}
        data-testid={`file-tree-file-${node.path}`}
        className={cn(
          "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm",
          "hover:bg-tertiary cursor-pointer",
          isSelected
            ? "bg-[var(--oh-interactive-hover)] text-white"
            : "text-[var(--oh-text-tertiary)]",
        )}
        // per-row indentation computed from tree depth at runtime
        style={{ paddingLeft: `${indentPx + 16}px` }}
      >
        <FileIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
