import { NavLink, Outlet } from "react-router";
import { PlugZap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

/**
 * Environment.
 *
 * The surface that makes this product installable into a company that runs a
 * different stack than we do: what each capability is pointed at, what is
 * still missing, and what is failing right now -- with an agent that can be
 * asked to fix any of it.
 */
const TABS = [
  {
    to: "/environment",
    testId: "overview",
    labelKey: I18nKey.ENVIRONMENT$TAB_OVERVIEW,
    end: true,
  },
  {
    to: "/environment/connections",
    testId: "connections",
    labelKey: I18nKey.ENVIRONMENT$TAB_CONNECTIONS,
    end: false,
  },
  {
    to: "/environment/network",
    testId: "network",
    labelKey: I18nKey.ENVIRONMENT$TAB_NETWORK,
    end: false,
  },
  {
    to: "/environment/requirements",
    testId: "requirements",
    labelKey: I18nKey.ENVIRONMENT$TAB_REQUIREMENTS,
    end: false,
  },
  {
    to: "/environment/runbook",
    testId: "runbook",
    labelKey: I18nKey.ENVIRONMENT$TAB_RUNBOOK,
    end: false,
  },
];

function EnvironmentScreen() {
  const { t } = useTranslation("openhands");

  return (
    <main
      data-testid="environment-screen"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <PlugZap size={20} className="text-[var(--primary-500)]" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t(I18nKey.ENVIRONMENT$TITLE)}
          </h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ENVIRONMENT$SUBTITLE)}
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)]">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            data-testid={`environment-tab-${tab.testId}`}
            className={({ isActive }) =>
              cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
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

export default EnvironmentScreen;
