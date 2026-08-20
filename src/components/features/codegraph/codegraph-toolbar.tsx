import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Filter, Maximize2, Search } from "lucide-react";
import type {
  CodeGraphCrumb,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";
import type { SearchEntry } from "#/lib/codegraph/analyzer-runner";
import { I18nKey } from "#/i18n/declaration";

interface Props {
  crumbs: CodeGraphCrumb[];
  nodeCount: number;
  visibleCount: number;
  types: string[];
  hiddenTypes: string[];
  onToggleType: (type: string) => void;
  onNavigate: (parentId: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: SearchEntry[];
  onSelectResult: (entry: SearchEntry) => void;
  /** Level nodes, used to show which results are on screen already. */
  levelNodes: CodeGraphNode[];
}

export function CodeGraphToolbar({
  crumbs,
  nodeCount,
  visibleCount,
  types,
  hiddenTypes,
  onToggleType,
  onNavigate,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelectResult,
  levelNodes,
}: Props) {
  const { t } = useTranslation("openhands");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const onScreen = React.useMemo(
    () => new Set(levelNodes.map((node) => node.id)),
    [levelNodes],
  );

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--oh-border)] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label={t(I18nKey.CODEGRAPH$BREADCRUMBS_LABEL)}
          data-testid="codegraph-breadcrumbs"
          className="flex min-w-0 flex-1 items-center gap-1 text-xs"
        >
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <React.Fragment key={crumb.id ?? "__root__"}>
                {index > 0 ? (
                  <ChevronRight
                    className="size-3 shrink-0 text-[var(--oh-muted)]"
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => onNavigate(crumb.id)}
                  className={
                    isLast
                      ? "truncate font-medium text-[var(--oh-foreground)]"
                      : "truncate text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]"
                  }
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <span
          data-testid="codegraph-node-count"
          className="shrink-0 rounded-full bg-[var(--oh-surface-raised)] px-2 py-0.5 text-[10px] font-medium text-[var(--oh-muted)]"
        >
          {visibleCount === nodeCount
            ? t(I18nKey.CODEGRAPH$NODES, { count: nodeCount })
            : t(I18nKey.CODEGRAPH$NODES_FILTERED, {
                visible: visibleCount,
                total: nodeCount,
              })}
        </span>

        {crumbs.length > 1 ? (
          <button
            type="button"
            data-testid="codegraph-back"
            onClick={() => onNavigate(crumbs[crumbs.length - 2].id)}
            className="shrink-0 rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
          >
            {t(I18nKey.CODEGRAPH$BACK)}
          </button>
        ) : null}

        <button
          type="button"
          data-testid="codegraph-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
        >
          <Filter className="size-3" aria-hidden />
          {t(I18nKey.CODEGRAPH$FILTERS)}
          {hiddenTypes.length > 0 ? (
            <span className="rounded-full bg-[var(--primary-bg-subtle)] px-1.5 text-[10px] text-[var(--primary-500)]">
              {hiddenTypes.length}
            </span>
          ) : null}
        </button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--oh-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t(I18nKey.CODEGRAPH$SEARCH_PLACEHOLDER)}
          data-testid="codegraph-search"
          className="w-full rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] py-1.5 pl-8 pr-3 text-xs text-[var(--oh-foreground)] outline-none focus:border-[var(--primary-500)]"
        />

        {searchQuery && searchResults.length > 0 ? (
          <ul
            data-testid="codegraph-search-results"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] shadow-lg custom-scrollbar"
          >
            {searchResults.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelectResult(entry)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--oh-interactive-hover)]"
                >
                  <span className="truncate text-[var(--oh-foreground)]">
                    {entry.name}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-[var(--oh-muted)]">
                    {entry.type}
                  </span>
                  {entry.filePath ? (
                    <span
                      className="ml-auto max-w-[45%] truncate font-mono text-[10px] text-[var(--oh-muted)]"
                      title={entry.filePath}
                    >
                      {entry.filePath}
                    </span>
                  ) : null}
                  {!onScreen.has(entry.id) ? (
                    <Maximize2
                      className="size-3 shrink-0 text-[var(--oh-muted)]"
                      aria-label={t(I18nKey.CODEGRAPH$OTHER_LEVEL)}
                    />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {filtersOpen ? (
        <div
          data-testid="codegraph-filters"
          className="flex flex-wrap gap-1.5 rounded-md border border-[var(--oh-border)] p-2"
        >
          {types.map((type) => {
            const hidden = hiddenTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={!hidden}
                onClick={() => onToggleType(type)}
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  hidden
                    ? "border-[var(--oh-border)] text-[var(--oh-muted)] line-through"
                    : "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
