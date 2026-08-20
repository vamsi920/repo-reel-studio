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
 * Security is workspace-scoped, and a workspace here is the same thing it is
 * everywhere else in the app: the checkout a repository snapshot points at
 * (see `workspaceIdForSnapshot`). `?repository=` picks a specific one;
 * otherwise the first connected repository wins. No repositories means there
 * is no workspace to talk about, which the page says plainly rather than
 * inventing one.
 */
export function useSecurityWorkspaceScope(
  repositoryIdParam: string | null,
): SecurityWorkspaceScope | null {
  const byRepositoryId = useKnowledgeStore((s) => s.byRepositoryId);
  return useMemo(() => {
    const entries = Object.values(byRepositoryId);
    if (entries.length === 0) return null;
    const selected =
      (repositoryIdParam
        ? entries.find((e) => e.snapshot.repositoryId === repositoryIdParam)
        : undefined) ?? entries[0];
    const { snapshot } = selected;
    return {
      workspaceId: workspaceIdForSnapshot(snapshot),
      repositoryId: snapshot.repositoryId,
      label: `${snapshot.owner}/${snapshot.repo}`,
      commitSha: snapshot.commitSha,
    };
  }, [byRepositoryId, repositoryIdParam]);
}

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
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="security-severity-legend"
    >
      {SECURITY_SEVERITIES.map((severity) => (
        <span
          key={severity}
          className="rounded-full border border-[var(--oh-border)] px-2 py-0.5 text-xs text-[var(--oh-muted)]"
        >
          {t(SEVERITY_KEY[severity])}
        </span>
      ))}
    </div>
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

        {scope ? (
          <p
            className="mt-3 font-mono text-xs text-[var(--oh-muted)]"
            data-testid="security-workspace-scope"
          >
            {scope.label}@{scope.commitSha.slice(0, 7)}
          </p>
        ) : (
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
            disabled
            title={t(I18nKey.SECURITY$FIX_WITH_AGENT_DISABLED)}
            className="ame-btn-secondary ame-btn-sm mt-1 self-start opacity-50"
            data-testid="security-fix-with-agent"
          >
            {t(I18nKey.SECURITY$FIX_WITH_AGENT)}
          </button>
        </section>

        <h2 className="mt-8 mb-3 text-sm font-medium text-[var(--oh-foreground)]">
          {t(I18nKey.SECURITY$FUTURE_AREAS)}
        </h2>
        <ul
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
