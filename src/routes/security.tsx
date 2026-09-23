import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  Boxes,
  FileWarning,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { workspaceIdForSnapshot } from "#/lib/codegraph/workspace-identity";
import { useConnectedRepositories } from "#/lib/knowledge/connected-repositories";
import { I18nKey } from "#/i18n/declaration";
import {
  SECURITY_SEVERITIES,
  type SecurityCategory,
  type SecuritySeverity,
} from "#/lib/security/security-types";

interface SecurityWorkspaceScope {
  workspaceId: string;
  repositoryId: string;
  label: string;
  /** Only known once real Knowledge/CodeGraph work has resolved a commit for
   * this repository (a knowledge-store entry). A repository that is only
   * known from an open conversation has no resolved commit yet, and showing
   * a fabricated one would be a lie -- see the "connected, not yet ingested"
   * branch below. */
  commitSha: string | null;
}

/**
 * What the page is scoped to, as three distinct outcomes rather than one
 * nullable scope. "no repository is connected" and "the repository you asked
 * for is not connected" are different situations and need different copy —
 * collapsing them lets the page stay silent about a `?repository=` that
 * pointed at nothing.
 */
export type SecurityWorkspaceScopeResult =
  | { state: "no-repositories" }
  | { state: "requested-not-connected"; repositoryId: string }
  | { state: "scoped"; scope: SecurityWorkspaceScope };

/** One entry of the repository picker: the id `?repository=` takes, and how it reads. */
export interface SecurityRepositoryOption {
  repositoryId: string;
  label: string;
  branch: string;
}

export interface SecurityWorkspaceScopeState {
  scope: SecurityWorkspaceScopeResult;
  /** Every connected repository, ordered by id — the same order the default pick uses. */
  repositories: SecurityRepositoryOption[];
  /** True while `scope.state` is `"no-repositories"` for a reason that might
   * still be "the open-conversations query hasn't answered yet", not "there
   * really are none" — see the note on `useConnectedRepositories`. Always
   * false once `repositories` is non-empty, since a real answer already
   * exists by then. */
  isLoading: boolean;
  /** True while `scope.state` is `"no-repositories"` for a reason that might
   * actually be "the open-conversations query failed", not "there really are
   * none" — an empty `repositories` from a failed fetch is indistinguishable
   * from a genuinely empty one otherwise, and reporting it as "no workspace"
   * would be a lie. Always false once `repositories` is non-empty, since a
   * real answer already exists by then regardless of this query's outcome. */
  isError: boolean;
}

/**
 * Security is workspace-scoped, and a workspace here is the same thing it is
 * everywhere else in the app: the checkout a repository snapshot points at
 * (see `workspaceIdForSnapshot`). `?repository=` picks a specific one; if it
 * names a repository that is not connected the page says so, because silently
 * scoping to some other repository would report one repository's security
 * posture under another repository's name.
 *
 * The knowledge store alone is not the full picture: it only gains an entry
 * once some Knowledge/CodeGraph/KT-video route has ingested a repository this
 * session, so a user who opens Security straight from the sidebar (its normal
 * entry point) without visiting one of those first saw "no workspace to scope
 * to" even with a repository open right now. `useConnectedRepositories`
 * (real, open conversations, the same source `/kt` lists from) fills that gap
 * for any repository the store doesn't already know about; it has no resolved
 * commit yet, so `commitSha` is left `null` rather than invented, and a
 * candidate with no working directory yet (still provisioning) is left out —
 * there is no checkout to scope to. A store entry, when one exists, always
 * wins: it reflects a real generation or a resolved commit, strictly more
 * than a bare open conversation does.
 *
 * With no `?repository=`, the connected repositories are ordered by id and the
 * first wins, so a reload cannot quietly re-scope the page just because the
 * store rehydrated its keys in a different order.
 *
 * `useConnectedRepositories`'s own contract warns that its `repositories`
 * starts empty on the very first render whether or not a live conversation
 * exists, until its `isLoading` flag clears. Landing on Security straight
 * from the sidebar (its normal entry point, with nothing in the knowledge
 * store yet) hits exactly that window, so `isLoading` is threaded through
 * rather than dropped, and the page below must not report "no workspace" off
 * the strength of a query that hasn't answered yet.
 */
export function useSecurityWorkspaceScope(
  repositoryIdParam: string | null,
): SecurityWorkspaceScopeState {
  const byRepositoryId = useKnowledgeStore((s) => s.byRepositoryId);
  const {
    repositories: connected,
    isLoading: connectedLoading,
    isError: connectedError,
  } = useConnectedRepositories();
  return useMemo(() => {
    const byId = new Map<
      string,
      { scope: SecurityWorkspaceScope; branch: string }
    >();
    Object.values(byRepositoryId).forEach(({ snapshot }) => {
      byId.set(snapshot.repositoryId, {
        scope: {
          workspaceId: workspaceIdForSnapshot(snapshot),
          repositoryId: snapshot.repositoryId,
          label: `${snapshot.owner}/${snapshot.repo}`,
          commitSha: snapshot.commitSha,
        },
        branch: snapshot.branch,
      });
    });
    connected.forEach((candidate) => {
      if (byId.has(candidate.repositoryId) || !candidate.workingDir) return;
      byId.set(candidate.repositoryId, {
        scope: {
          workspaceId: candidate.workingDir,
          repositoryId: candidate.repositoryId,
          label: `${candidate.owner}/${candidate.repo}`,
          commitSha: null,
        },
        branch: candidate.branch,
      });
    });

    const entries = [...byId.values()].sort((a, b) =>
      a.scope.repositoryId.localeCompare(b.scope.repositoryId),
    );
    const repositories = entries.map(({ scope, branch }) => ({
      repositoryId: scope.repositoryId,
      label: scope.label,
      branch,
    }));
    if (entries.length === 0) {
      return {
        scope: { state: "no-repositories" },
        repositories,
        isLoading: connectedLoading,
        isError: connectedError,
      };
    }

    if (repositoryIdParam) {
      const requested = byId.get(repositoryIdParam);
      if (requested) {
        return {
          scope: { state: "scoped", scope: requested.scope },
          repositories,
          isLoading: false,
          isError: false,
        };
      }
      // Not found in a store entry, but the open-conversations query (the
      // other source `byId` is built from) may simply not have answered yet
      // -- reporting "not connected" off that silence would be the same lie
      // the "no-repositories" branch above already guards against; the
      // requested repository may still turn up once it resolves.
      return {
        scope: {
          state: "requested-not-connected",
          repositoryId: repositoryIdParam,
        },
        repositories,
        isLoading: connectedLoading,
        isError: connectedError,
      };
    }

    return {
      scope: { state: "scoped", scope: entries[0].scope },
      repositories,
      isLoading: false,
      isError: false,
    };
  }, [
    byRepositoryId,
    connected,
    connectedLoading,
    connectedError,
    repositoryIdParam,
  ]);
}

const FIX_WITH_AGENT_HINT_ID = "security-fix-with-agent-hint";
const FUTURE_AREAS_HEADING_ID = "security-future-areas-heading";
const EMPTY_STATE_HEADING_ID = "security-empty-state-heading";
const REPOSITORY_NOT_CONNECTED_ID = "security-repository-not-connected-hint";

const SEVERITY_KEY: Record<SecuritySeverity, I18nKey> = {
  critical: I18nKey.SECURITY$SEVERITY_CRITICAL,
  high: I18nKey.SECURITY$SEVERITY_HIGH,
  medium: I18nKey.SECURITY$SEVERITY_MEDIUM,
  low: I18nKey.SECURITY$SEVERITY_LOW,
  info: I18nKey.SECURITY$SEVERITY_INFO,
};

const FUTURE_AREAS: {
  category: SecurityCategory;
  titleKey: I18nKey;
  detailKey: I18nKey;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    category: "repository",
    titleKey: I18nKey.SECURITY$AREA_REPOSITORY,
    detailKey: I18nKey.SECURITY$AREA_REPOSITORY_DETAIL,
    icon: ShieldCheck,
  },
  {
    category: "dependencies",
    titleKey: I18nKey.SECURITY$AREA_DEPENDENCIES,
    detailKey: I18nKey.SECURITY$AREA_DEPENDENCIES_DETAIL,
    icon: Boxes,
  },
  {
    category: "secrets",
    titleKey: I18nKey.SECURITY$AREA_SECRETS,
    detailKey: I18nKey.SECURITY$AREA_SECRETS_DETAIL,
    icon: KeyRound,
  },
  {
    category: "misconfiguration",
    titleKey: I18nKey.SECURITY$AREA_MISCONFIGURATION,
    detailKey: I18nKey.SECURITY$AREA_MISCONFIGURATION_DETAIL,
    icon: SlidersHorizontal,
  },
  {
    category: "risk",
    titleKey: I18nKey.SECURITY$AREA_RISK,
    detailKey: I18nKey.SECURITY$AREA_RISK_DETAIL,
    icon: FileWarning,
  },
  {
    category: "remediation",
    titleKey: I18nKey.SECURITY$AREA_REMEDIATION,
    detailKey: I18nKey.SECURITY$AREA_REMEDIATION_DETAIL,
    icon: Wrench,
  },
];

interface RepositorySelectProps {
  repositories: SecurityRepositoryOption[];
  /** The connected repository the page is scoped to, or `null` when `?repository=` named an unknown one. */
  selectedRepositoryId: string | null;
  onSelect: (repositoryId: string) => void;
  /** Set when `?repository=` named a repository that is not connected, so
   * assistive tech reaches the same explanation a sighted user reads in the
   * status line above — the same `aria-describedby` pattern this file
   * already uses for the disabled "Fix with Agent" button's hint. */
  invalidSelectionHintId?: string;
}

/**
 * The only way to re-scope the page is `?repository=`, which nothing in the
 * UI writes. With several repositories connected, or with the URL pointing at
 * one that is not, the user needs a control that writes it for them.
 */
function RepositorySelect({
  repositories,
  selectedRepositoryId,
  onSelect,
  invalidSelectionHintId,
}: RepositorySelectProps) {
  const { t } = useTranslation("openhands");
  // Two connected snapshots of the same owner/repo on different branches
  // share the same `label` ("owner/repo") — without the branch, their
  // options would render as identical, indistinguishable text and a user
  // could not tell which one they were picking.
  const labelCounts = new Map<string, number>();
  repositories.forEach((repository) => {
    labelCounts.set(
      repository.label,
      (labelCounts.get(repository.label) ?? 0) + 1,
    );
  });
  return (
    <div className="mt-3 flex flex-col gap-1">
      {/* A visible label, not just `aria-label`: a sighted mouse user needs
          the same context a screen reader gets from the select's accessible
          name — an unlabelled dropdown reads as "what does this pick?". */}
      <label
        className="text-xs text-[var(--oh-muted)]"
        htmlFor="security-repository-select"
      >
        {t(I18nKey.SECURITY$REPOSITORY_SELECT_LABEL)}
      </label>
      <select
        id="security-repository-select"
        className="rounded-md border border-[var(--oh-border)] bg-transparent px-2 py-1 text-xs text-[var(--oh-foreground)]"
        data-testid="security-repository-select"
        value={selectedRepositoryId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        aria-invalid={invalidSelectionHintId ? true : undefined}
        aria-describedby={invalidSelectionHintId}
      >
        {selectedRepositoryId === null && (
          <option value="" disabled>
            {t(I18nKey.SECURITY$REPOSITORY_SELECT_PICK)}
          </option>
        )}
        {repositories.map((repository) => (
          <option key={repository.repositoryId} value={repository.repositoryId}>
            {(labelCounts.get(repository.label) ?? 0) > 1
              ? `${repository.label} (${repository.branch})`
              : repository.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SeverityLegend() {
  const { t } = useTranslation("openhands");
  return (
    <ul
      aria-label={t(I18nKey.SECURITY$SEVERITY_LEGEND_LABEL)}
      className="flex flex-wrap items-center gap-2"
      data-testid="security-severity-legend"
    >
      {SECURITY_SEVERITIES.map((severity) => (
        <li
          key={severity}
          className="rounded-full border border-[var(--oh-border)] px-2 py-0.5 text-xs text-[var(--oh-muted)]"
        >
          {t(SEVERITY_KEY[severity])}
        </li>
      ))}
    </ul>
  );
}

function SecurityScreen() {
  const { t } = useTranslation("openhands");
  const [searchParams, setSearchParams] = useSearchParams();
  const { scope, repositories, isLoading, isError } = useSecurityWorkspaceScope(
    searchParams.get("repository"),
  );
  const selectRepository = useCallback(
    (repositoryId: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("repository", repositoryId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  // One connected repository that is also the one shown needs no picker; it
  // would be a one-option dropdown. It comes back the moment there is a
  // choice to make, or the URL asks for a repository that is not there.
  const showRepositorySelect =
    repositories.length > 1 || scope.state === "requested-not-connected";

  return (
    <main className="min-h-full" data-testid="security-page">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-xl font-semibold text-[var(--oh-foreground)]">
            {t(I18nKey.SECURITY$TITLE)}
          </h1>
          <span
            className="rounded-full border border-[var(--oh-border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--oh-muted)]"
            data-testid="security-beta-badge"
          >
            {t(I18nKey.SECURITY$BETA)}
          </span>
        </div>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.SECURITY$SUBTITLE)}
        </p>

        {scope.state === "scoped" && (
          <p
            className="mt-3 font-mono text-xs text-[var(--oh-muted)]"
            data-testid="security-workspace-scope"
            role="status"
          >
            {scope.scope.commitSha
              ? `${scope.scope.label}@${scope.scope.commitSha.slice(0, 7)}`
              : scope.scope.label}
          </p>
        )}
        {scope.state === "requested-not-connected" && isError && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-connected-repositories-error"
            role="status"
          >
            {t(I18nKey.SECURITY$CONNECTED_REPOSITORIES_ERROR)}
          </p>
        )}
        {scope.state === "requested-not-connected" && !isError && isLoading && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-loading-workspace"
            role="status"
          >
            {t(I18nKey.SECURITY$LOADING_WORKSPACE)}
          </p>
        )}
        {scope.state === "requested-not-connected" &&
          !isError &&
          !isLoading && (
            <p
              className="mt-3 text-xs text-[var(--oh-muted)]"
              data-testid="security-repository-not-connected"
              id={REPOSITORY_NOT_CONNECTED_ID}
              role="status"
            >
              {t(I18nKey.SECURITY$REPOSITORY_NOT_CONNECTED, {
                repository: scope.repositoryId,
              })}
            </p>
          )}
        {scope.state === "no-repositories" && isError && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-connected-repositories-error"
            role="status"
          >
            {t(I18nKey.SECURITY$CONNECTED_REPOSITORIES_ERROR)}
          </p>
        )}
        {scope.state === "no-repositories" && !isError && isLoading && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-loading-workspace"
            role="status"
          >
            {t(I18nKey.SECURITY$LOADING_WORKSPACE)}
          </p>
        )}
        {scope.state === "no-repositories" && !isError && !isLoading && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-no-workspace"
            role="status"
          >
            {t(I18nKey.SECURITY$NO_WORKSPACE)}
          </p>
        )}
        {showRepositorySelect && (
          <RepositorySelect
            repositories={repositories}
            selectedRepositoryId={
              scope.state === "scoped" ? scope.scope.repositoryId : null
            }
            onSelect={selectRepository}
            invalidSelectionHintId={
              scope.state === "requested-not-connected" &&
              !isLoading &&
              !isError
                ? REPOSITORY_NOT_CONNECTED_ID
                : undefined
            }
          />
        )}

        <section
          aria-labelledby={EMPTY_STATE_HEADING_ID}
          className="instrument-panel ame-card mt-6 flex flex-col gap-3 p-5"
          data-testid="security-empty-state"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="size-4 text-[var(--oh-muted)]"
              aria-hidden
            />
            <h2
              className="text-sm font-medium text-[var(--oh-foreground)]"
              id={EMPTY_STATE_HEADING_ID}
            >
              {t(I18nKey.SECURITY$NOT_CONFIGURED)}
            </h2>
          </div>
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.SECURITY$NOT_CONFIGURED_DETAIL)}
          </p>
          <SeverityLegend />
          <button
            type="button"
            aria-disabled
            aria-describedby={FIX_WITH_AGENT_HINT_ID}
            className="ame-btn-secondary ame-btn-sm mt-1 self-start cursor-not-allowed opacity-50"
            data-testid="security-fix-with-agent"
          >
            {t(I18nKey.SECURITY$FIX_WITH_AGENT)}
          </button>
          <p
            className="text-xs text-[var(--oh-muted)]"
            id={FIX_WITH_AGENT_HINT_ID}
            data-testid="security-fix-with-agent-hint"
          >
            {t(I18nKey.SECURITY$FIX_WITH_AGENT_DISABLED)}
          </p>
        </section>

        <h2
          className="mt-8 mb-3 text-sm font-medium text-[var(--oh-foreground)]"
          id={FUTURE_AREAS_HEADING_ID}
        >
          {t(I18nKey.SECURITY$FUTURE_AREAS)}
        </h2>
        <ul
          aria-labelledby={FUTURE_AREAS_HEADING_ID}
          className="grid gap-3 sm:grid-cols-2"
          data-testid="security-future-areas"
        >
          {FUTURE_AREAS.map((area) => {
            const Icon = area.icon;
            return (
              <li
                key={area.category}
                className="instrument-panel ame-card flex flex-col gap-2 p-4"
                data-testid={`security-area-${area.category}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-[var(--oh-muted)]" aria-hidden />
                  <span className="text-sm font-medium text-[var(--oh-foreground)]">
                    {t(area.titleKey)}
                  </span>
                </div>
                <p className="text-xs text-[var(--oh-muted)]">
                  {t(area.detailKey)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

export default SecurityScreen;
