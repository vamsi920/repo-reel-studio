import { DiffEditor, Editor, Monaco } from "@monaco-editor/react";
import React from "react";
import { editor as editor_t } from "monaco-editor";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  LuFileDiff,
  LuFileMinus,
  LuFilePlus,
  LuHistory,
  LuGitCompareArrows,
  LuFileCheck,
} from "react-icons/lu";
import { IconType } from "react-icons/lib";
import { GitChangeStatus } from "#/api/open-hands.types";
import { I18nKey } from "#/i18n/declaration";
import { isSdkHttpError } from "#/api/agent-server-compatibility";
import { getLanguageFromPath } from "#/utils/get-language-from-path";
import { cn } from "#/utils/utils";
import ChevronUp from "#/icons/chveron-up.svg?react";
import { useUnifiedGitDiff } from "#/hooks/query/use-unified-git-diff";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { Typography } from "#/ui/typography";
import { LoadingSpinner } from "./loading-spinner";
import { EditorContainer } from "./editor-container";

/**
 * The runtime's `/api/git/diff` failure shape mirrors the workspace file
 * reader: cloud calls throw axios errors, local calls throw the SDK's
 * `HttpError` — see `use-bash-command-logs.ts` for the same extraction.
 */
function getHttpStatus(error: unknown): number | null {
  if (axios.isAxiosError(error)) return error.response?.status ?? null;
  if (isSdkHttpError(error)) return (error as { status: number }).status;
  return null;
}

type ViewMode = "diff" | "old" | "new";

const VIEW_MODES: { mode: ViewMode; icon: IconType }[] = [
  { mode: "old", icon: LuHistory },
  { mode: "diff", icon: LuGitCompareArrows },
  { mode: "new", icon: LuFileCheck },
];

// Monaco virtualizes rows based on its own layout height. Sizing the
// container to the full content height (as we do for compact diffs) makes
// every row "visible" from Monaco's perspective, so a huge added/changed
// file renders one DOM row per line instead of only the on-screen ones.
// Capping the height keeps Monaco's internal scrolling — and therefore its
// virtualization — active past this point.
const MAX_EDITOR_HEIGHT = 600;

const SHARED_EDITOR_OPTIONS: editor_t.IEditorOptions = {
  renderValidationDecorations: "off",
  readOnly: true,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollbar: { alwaysConsumeMouseWheel: false },
};

const STATUS_MAP: Record<GitChangeStatus, string | IconType> = {
  A: LuFilePlus,
  D: LuFileMinus,
  M: LuFileDiff,
  R: "Renamed",
  U: "Untracked",
};

const beforeMount = (monaco: Monaco) => {
  monaco.editor.defineTheme("custom-diff-theme", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a9955" },
      { token: "keyword", foreground: "569cd6" },
      { token: "string", foreground: "ce9178" },
      { token: "number", foreground: "b5cea8" },
    ],
    colors: {
      "diffEditor.insertedTextBackground": "#014b01AA",
      "diffEditor.removedTextBackground": "#750000AA",
      "diffEditor.insertedLineBackground": "#003f00AA",
      "diffEditor.removedLineBackground": "#5a0000AA",
      "diffEditor.border": "var(--oh-border-subtle)",
      "editorUnnecessaryCode.border": "#00000000",
      "editorUnnecessaryCode.opacity": "rgba(0, 0, 0, 0.467)",
    },
  });
};

export interface FileDiffViewerProps {
  path: string;
  type: GitChangeStatus;
  /**
   * When set, show the file's diff as changed by this commit instead of
   * the working-tree-vs-base diff. Deleted files render their content in
   * commit mode (both sides come from git objects).
   */
  commit?: string;
}

export function FileDiffViewer({ path, type, commit }: FileDiffViewerProps) {
  const { t } = useTranslation("openhands");
  const [isCollapsed, setIsCollapsed] = React.useState(true);
  const [editorHeight, setEditorHeight] = React.useState(400);
  const [viewMode, setViewMode] = React.useState<ViewMode>("diff");
  const diffEditorRef = React.useRef<editor_t.IStandaloneDiffEditor>(null);
  const singleEditorRef = React.useRef<editor_t.IStandaloneCodeEditor>(null);

  const isAdded = type === "A" || type === "U";
  const isDeleted = type === "D";

  const filePath = React.useMemo(() => {
    if (type === "R") {
      const parts = path.split(/\s+/).slice(1);
      return parts[parts.length - 1];
    }
    return path;
  }, [path, type]);

  const {
    data: diff,
    isLoading,
    isSuccess,
    isRefetching,
    isError,
    error,
    refetch,
  } = useUnifiedGitDiff({
    filePath,
    type,
    enabled: !isCollapsed,
    commit,
  });

  const updateEditorHeight = React.useCallback(() => {
    if (!diffEditorRef.current) return;
    const originalEditor = diffEditorRef.current.getOriginalEditor();
    const modifiedEditor = diffEditorRef.current.getModifiedEditor();
    if (originalEditor && modifiedEditor) {
      setEditorHeight(
        Math.min(
          Math.max(
            originalEditor.getContentHeight(),
            modifiedEditor.getContentHeight(),
          ) + 20,
          MAX_EDITOR_HEIGHT,
        ),
      );
    }
  }, []);

  const updateSingleEditorHeight = React.useCallback(() => {
    if (singleEditorRef.current) {
      setEditorHeight(
        Math.min(
          singleEditorRef.current.getContentHeight() + 20,
          MAX_EDITOR_HEIGHT,
        ),
      );
    }
  }, []);

  const handleDiffEditorMount = (editor: editor_t.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor;
    updateEditorHeight();
    editor.getOriginalEditor().onDidContentSizeChange(updateEditorHeight);
    editor.getModifiedEditor().onDidContentSizeChange(updateEditorHeight);
  };

  const handleSingleEditorMount = (editor: editor_t.IStandaloneCodeEditor) => {
    singleEditorRef.current = editor;
    updateSingleEditorHeight();
    editor.onDidContentSizeChange(updateSingleEditorHeight);
  };

  const status = (type === "U" ? STATUS_MAP.A : STATUS_MAP[type]) || "?";
  const statusIcon =
    typeof status === "string" ? (
      <Typography.Text>{status}</Typography.Text>
    ) : (
      React.createElement(status, { className: "w-5 h-5" })
    );

  const isFetchingData = isLoading || isRefetching;
  const language = getLanguageFromPath(filePath);
  const isMarkdownFile = language === "markdown";
  const singleViewContent =
    viewMode === "old" ? (diff?.original ?? "") : (diff?.modified ?? "");

  const renderContent = () => {
    if (viewMode === "diff") {
      return (
        <EditorContainer height={editorHeight}>
          <DiffEditor
            data-testid="file-diff-viewer"
            className="w-full h-full"
            language={language}
            original={isAdded ? "" : (diff?.original ?? "")}
            modified={isDeleted ? "" : (diff?.modified ?? "")}
            theme="custom-diff-theme"
            onMount={handleDiffEditorMount}
            beforeMount={beforeMount}
            options={{
              ...SHARED_EDITOR_OPTIONS,
              renderSideBySide: !isAdded && !isDeleted,
              hideUnchangedRegions: { enabled: true },
            }}
          />
        </EditorContainer>
      );
    }

    if (isMarkdownFile) {
      return (
        <div
          className="w-full border-b border-[var(--oh-border)] overflow-auto p-4 bg-base prose prose-invert max-w-none"
          data-testid="markdown-preview"
        >
          <MarkdownRenderer
            content={singleViewContent}
            includeStandard
            includeHeadings
          />
        </div>
      );
    }

    return (
      <EditorContainer height={editorHeight}>
        <Editor
          data-testid="file-single-viewer"
          className="w-full h-full"
          language={language}
          value={singleViewContent}
          theme="custom-diff-theme"
          beforeMount={beforeMount}
          onMount={handleSingleEditorMount}
          options={SHARED_EDITOR_OPTIONS}
        />
      </EditorContainer>
    );
  };

  return (
    <div data-testid="file-diff-viewer-outer" className="w-full flex flex-col">
      <div
        className="flex justify-between items-center px-3 py-2.5 border-b border-[var(--oh-border)] hover:cursor-pointer"
        onClick={() => setIsCollapsed((prev) => !prev)}
      >
        <span className="text-sm w-full text-content flex items-center gap-2">
          {isFetchingData ? <LoadingSpinner className="w-4 h-4" /> : statusIcon}
          <strong className="w-full truncate font-medium">{filePath}</strong>
          {!isCollapsed && !isDeleted && (
            <span
              className="flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {VIEW_MODES.map(({ mode, icon: Icon }) => (
                <button
                  key={mode}
                  data-testid={`view-mode-${mode}`}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "p-1 rounded transition-colors cursor-pointer",
                    viewMode === mode
                      ? "bg-[var(--oh-interactive-hover)] text-white"
                      : "text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-white",
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </span>
          )}
          <button data-testid="collapse" type="button">
            <ChevronUp
              className={cn(
                "w-4 h-4 transition-transform",
                isCollapsed && "transform rotate-180",
              )}
            />
          </button>
        </span>
      </div>

      {!isCollapsed && isDeleted && !commit && (
        <div
          data-testid="file-deleted-message"
          className="w-full border-b border-[var(--oh-border)] p-4 bg-base text-[var(--oh-text-dim)] text-sm"
        >
          {t(I18nKey.DIFF_VIEWER$FILE_DELETED)}
        </div>
      )}

      {!isCollapsed && (!isDeleted || !!commit) && isError && (
        <div
          className="flex w-full flex-col items-center justify-center gap-2 border-b border-[var(--oh-border)] bg-base p-4 text-center text-sm text-[var(--oh-muted)]"
          data-testid="file-diff-viewer-error"
          role="alert"
        >
          <span>{t(I18nKey.FILES$LOAD_ERROR)}</span>
          {(() => {
            const status = getHttpStatus(error);
            return (
              status !== null && (
                <span
                  className="text-xs text-[var(--oh-text-tertiary)]"
                  data-testid="file-diff-viewer-error-status"
                >
                  {t(I18nKey.FILES$LOAD_ERROR_STATUS, { status })}
                </span>
              )
            );
          })()}
          <button
            type="button"
            onClick={() => refetch()}
            data-testid="file-diff-viewer-retry"
            className="cursor-pointer rounded-[7px] px-3 py-1 text-white hover:bg-[var(--oh-interactive-hover)]"
          >
            {t(I18nKey.FILES$RETRY)}
          </button>
        </div>
      )}

      {!isCollapsed && (!isDeleted || !!commit) && isSuccess && renderContent()}
    </div>
  );
}
