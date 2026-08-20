import { NavLink, Outlet } from "react-router";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useAgentOpsWorkspaceActivity } from "#/hooks/use-agentops-workspace-activity";

/**
 * AgentOps Control Tower.
 *
 * OpenHands agent-server remains the agent runtime; AgentOps supplies the
 * observability vocabulary (vendored MIT semantic conventions); NeoDevEx adds
 * the control layer — policy, budgets, approvals and audit. See AGENTS.md,
 * "AgentOps Control Tower".
 */

const TABS = [
  {
    to: "/agentops",
    testId: "overview",
    labelKey: I18nKey.AGENTOPS$TAB_OVERVIEW,
    end: true,
  },
  {
    to: "/agentops/live",
    testId: "live-runs",
    labelKey: I18nKey.AGENTOPS$TAB_LIVE_RUNS,
    end: false,
  },
  {
    to: "/agentops/approvals",
    testId: "approvals",
    labelKey: I18nKey.AGENTOPS$TAB_APPROVALS,
    end: false,
  },
  {
    to: "/agentops/history",
    testId: "history",
    labelKey: I18nKey.AGENTOPS$TAB_HISTORY,
    end: false,
  },
  {
    to: "/agentops/budgets",
    testId: "budgets",
    labelKey: I18nKey.AGENTOPS$TAB_BUDGETS,
    end: false,
  },
];

function AgentOpsScreen() {
  const { t } = useTranslation("openhands");
  // Mirror the collector's audit milestones into the workspace activity feed
  // for as long as a Control Tower surface is open.
  useAgentOpsWorkspaceActivity();

  return (
    <main
      data-testid="agentops-screen"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-[var(--primary-500)]" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t(I18nKey.AGENTOPS$TITLE)}
          </h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {t(I18nKey.AGENTOPS$SUBTITLE)}
        </p>
      </header>

      <nav className="flex gap-1 border-b border-[var(--border-color)]">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            data-testid={`agentops-tab-${tab.testId}`}
            className={({ isActive }) =>
              cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                isActive
                  ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </main>
  );
}

export default AgentOpsScreen;
