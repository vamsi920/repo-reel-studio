import React from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, FileCode, Video, X } from "lucide-react";
import { NavigationLink } from "#/components/shared/navigation-link";
import type {
  CodeGraphEdge,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";
import type { KnowledgeLink } from "#/lib/codegraph/deepwiki-bridge";
import { I18nKey } from "#/i18n/declaration";

interface Props {
  node: CodeGraphNode;
  edges: CodeGraphEdge[];
  siblings: CodeGraphNode[];
  knowledgeLink: KnowledgeLink | null;
  onSelect: (nodeId: string) => void;
  onDrillDown: (nodeId: string) => void;
  onClose: () => void;
  /** Reads real file content for file/symbol nodes. */
  readSource: (filePath: string) => Promise<string | null>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NodeChip({
  node,
  onSelect,
}: {
  node: CodeGraphNode;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="flex w-full items-center gap-2 rounded-md border border-[var(--oh-border)] px-2 py-1.5 text-left text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
    >
      <span className="truncate">{node.name}</span>
      <span className="ml-auto shrink-0 text-[10px] uppercase text-[var(--oh-muted)]">
        {node.type}
      </span>
    </button>
  );
}

export function CodeGraphNodeDetails({
  node,
  edges,
  siblings,
  knowledgeLink,
  onSelect,
  onDrillDown,
  onClose,
  readSource,
}: Props) {
  const { t } = useTranslation("openhands");
  const [source, setSource] = React.useState<string | null>(null);
  const [sourceState, setSourceState] = React.useState<
    "idle" | "loading" | "missing"
  >("idle");

  const byId = React.useMemo(
    () => new Map(siblings.map((sibling) => [sibling.id, sibling])),
    [siblings],
  );

  const dependencies = React.useMemo(
    () =>
      edges
        .filter((edge) => edge.source === node.id)
        .map((edge) => ({ edge, target: byId.get(edge.target) }))
        .filter(
          (entry): entry is { edge: CodeGraphEdge; target: CodeGraphNode } =>
            Boolean(entry.target),
        ),
    [edges, node.id, byId],
  );

  const usedBy = React.useMemo(
    () =>
      edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => ({ edge, source: byId.get(edge.source) }))
        .filter(
          (entry): entry is { edge: CodeGraphEdge; source: CodeGraphNode } =>
            Boolean(entry.source),
        ),
    [edges, node.id, byId],
  );

  const related = React.useMemo(() => {
    const connected = new Set([
      ...dependencies.map((entry) => entry.target.id),
      ...usedBy.map((entry) => entry.source.id),
    ]);
    return siblings
      .filter((sibling) => sibling.id !== node.id && !connected.has(sibling.id))
      .slice(0, 6);
  }, [siblings, node.id, dependencies, usedBy]);

  const loadSource = React.useCallback(async () => {
    if (!node.filePath) return;
    setSourceState("loading");
    const content = await readSource(node.filePath);
    if (content === null) {
      setSourceState("missing");
      return;
    }
    setSourceState("idle");
    setSource(content);
  }, [node.filePath, readSource]);

  React.useEffect(() => {
    setSource(null);
    setSourceState("idle");
  }, [node.id]);

  const excerpt = React.useMemo(() => {
    if (!source) return null;
    const lines = source.split("\n");
    if (!node.lineRange) return lines.slice(0, 60).join("\n");
    const [start, end] = node.lineRange;
    // lineRange is 1-based and inclusive; pad a little for context.
    return lines.slice(Math.max(0, start - 3), end + 2).join("\n");
  }, [source, node.lineRange]);

  return (
    <aside
      data-testid="codegraph-node-details"
      className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 custom-scrollbar"
    >
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            {node.type}
          </p>
          <h2 className="truncate text-base font-semibold text-[var(--oh-foreground)]">
            {node.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t(I18nKey.CODEGRAPH$CLOSE_DETAILS)}
          className="rounded-md p-1 text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {node.summary ? (
        <Section title={t(I18nKey.CODEGRAPH$PURPOSE)}>
          <p className="text-xs leading-relaxed text-[var(--oh-foreground)]">
            {node.summary}
          </p>
        </Section>
      ) : null}

      {/*
        Documentation links appear only when DeepWiki actually has a page for
        this component. A node with no matching page shows structural facts and
        nothing else — we never invent a page to link to.
      */}
      {knowledgeLink ? (
        <Section title={t(I18nKey.CODEGRAPH$KNOWLEDGE)}>
          <div className="flex flex-col gap-1.5">
            <NavigationLink
              to={knowledgeLink.readPath}
              data-testid="codegraph-read-docs"
              className="flex items-center gap-2 rounded-md border border-[var(--oh-border)] px-2 py-1.5 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
            >
              <BookOpen className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t(I18nKey.CODEGRAPH$READ_DOCS)}</span>
            </NavigationLink>
            <NavigationLink
              to={knowledgeLink.watchPath}
              data-testid="codegraph-watch-kt"
              className="flex items-center gap-2 rounded-md border border-[var(--oh-border)] px-2 py-1.5 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
            >
              <Video className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t(I18nKey.KT$WATCH_KT)}</span>
            </NavigationLink>
            <p className="text-[10px] text-[var(--oh-muted)]">
              {knowledgeLink.pageTitle}
            </p>
          </div>
        </Section>
      ) : null}

      {node.childCount > 0 ? (
        <Section title={t(I18nKey.CODEGRAPH$CONTENTS)}>
          <button
            type="button"
            onClick={() => onDrillDown(node.id)}
            data-testid="codegraph-drill-down"
            className="w-full rounded-md border border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] px-2 py-1.5 text-xs font-medium text-[var(--primary-500)]"
          >
            {t(I18nKey.CODEGRAPH$EXPLORE, { count: node.childCount })}
          </button>
        </Section>
      ) : null}

      {dependencies.length > 0 ? (
        <Section
          title={t(I18nKey.CODEGRAPH$DEPENDENCIES, {
            count: dependencies.length,
          })}
        >
          <div className="flex flex-col gap-1">
            {dependencies.map(({ edge, target }) => (
              <NodeChip
                key={`${edge.type}-${target.id}`}
                node={target}
                onSelect={onSelect}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {usedBy.length > 0 ? (
        <Section title={t(I18nKey.CODEGRAPH$USED_BY, { count: usedBy.length })}>
          <div className="flex flex-col gap-1">
            {usedBy.map(({ edge, source: from }) => (
              <NodeChip
                key={`${edge.type}-${from.id}`}
                node={from}
                onSelect={onSelect}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Section title={t(I18nKey.CODEGRAPH$RELATED)}>
          <div className="flex flex-col gap-1">
            {related.map((sibling) => (
              <NodeChip key={sibling.id} node={sibling} onSelect={onSelect} />
            ))}
          </div>
        </Section>
      ) : null}

      {node.filePaths.length > 0 ? (
        <Section
          title={t(I18nKey.CODEGRAPH$RELEVANT_FILES, {
            count: node.filePaths.length,
          })}
        >
          <ul className="flex flex-col gap-0.5">
            {node.filePaths.slice(0, 12).map((path) => (
              <li
                key={path}
                className="truncate font-mono text-[10px] text-[var(--oh-muted)]"
                title={path}
              >
                {path}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {node.filePath ? (
        <Section title={t(I18nKey.CODEGRAPH$SOURCE)}>
          {excerpt ? (
            <pre className="max-h-72 overflow-auto rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-2 font-mono text-[10px] leading-relaxed text-[var(--oh-foreground)] custom-scrollbar">
              {excerpt}
            </pre>
          ) : (
            <button
              type="button"
              onClick={loadSource}
              disabled={sourceState === "loading"}
              data-testid="codegraph-open-source"
              className="flex w-full items-center gap-2 rounded-md border border-[var(--oh-border)] px-2 py-1.5 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] disabled:opacity-60"
            >
              <FileCode className="size-3.5 shrink-0" aria-hidden />
              {sourceState === "loading"
                ? t(I18nKey.CODEGRAPH$LOADING_SOURCE)
                : sourceState === "missing"
                  ? t(I18nKey.CODEGRAPH$SOURCE_MISSING)
                  : t(I18nKey.CODEGRAPH$OPEN_SOURCE)}
            </button>
          )}
        </Section>
      ) : null}
    </aside>
  );
}
