import { useMemo } from "react";
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
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
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
  commitSha: string;
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

function scopedTo(snapshot: RepositorySnapshot): SecurityWorkspaceScopeResult {
  return {
    state: "scoped",
    scope: {
      workspaceId: workspaceIdForSnapshot(snapshot),
      repositoryId: snapshot.repositoryId,
      label: `${snapshot.owner}/${snapshot.repo}`,
      commitSha: snapshot.commitSha,
    },
  };
}

/**
 * Security is workspace-scoped, and a workspace here is the same thing it is
 * everywhere else in the app: the checkout a repository snapshot points at
 * (see `workspaceIdForSnapshot`). `?repository=` picks a specific one; if it
 * names a repository that is not connected the page says so, because silently
 * scoping to some other repository would report one repository's security
 * posture under another repository's name.
 *
 * With no `?repository=`, the connected repositories are ordered by id and the
 * first wins, so a reload cannot quietly re-scope the page just because the
 * store rehydrated its keys in a different order.
 */
export function useSecurityWorkspaceScope(
  repositoryIdParam: string | null,
): SecurityWorkspaceScopeResult {
  const byRepositoryId = useKnowledgeStore((s) => s.byRepositoryId);
  return useMemo(() => {
    const entries = Object.values(byRepositoryId);
    if (entries.length === 0) return { state: "no-repositories" };

    if (repositoryIdParam) {
      const requested = entries.find(
        (e) => e.snapshot.repositoryId === repositoryIdParam,
      );
      return requested
        ? scopedTo(requested.snapshot)
        : {
            state: "requested-not-connected",
            repositoryId: repositoryIdParam,
          };
    }

    const [first] = [...entries].sort((a, b) =>
      a.snapshot.repositoryId.localeCompare(b.snapshot.repositoryId),
    );
    return scopedTo(first.snapshot);
  }, [byRepositoryId, repositoryIdParam]);
}

const FIX_WITH_AGENT_HINT_ID = "security-fix-with-agent-hint";
const FUTURE_AREAS_HEADING_ID = "security-future-areas-heading";

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
  const [searchParams] = useSearchParams();
  const scope = useSecurityWorkspaceScope(searchParams.get("repository"));

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
          >
            {scope.scope.label}@{scope.scope.commitSha.slice(0, 7)}
          </p>
        )}
        {scope.state === "requested-not-connected" && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-repository-not-connected"
            role="status"
          >
            {t(I18nKey.SECURITY$REPOSITORY_NOT_CONNECTED, {
              repository: scope.repositoryId,
            })}
          </p>
        )}
        {scope.state === "no-repositories" && (
          <p
            className="mt-3 text-xs text-[var(--oh-muted)]"
            data-testid="security-no-workspace"
          >
            {t(I18nKey.SECURITY$NO_WORKSPACE)}
          </p>
        )}

        <section
          className="instrument-panel ame-card mt-6 flex flex-col gap-3 p-5"
          data-testid="security-empty-state"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="size-4 text-[var(--oh-muted)]"
              aria-hidden
            />
            <h2 className="text-sm font-medium text-[var(--oh-foreground)]">
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
