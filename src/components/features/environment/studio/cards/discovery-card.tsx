import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { COMPANY_PROFILE_SECTION_ORDER } from "#/lib/environment/types/company";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import { DISCOVERY_SECTION_LABEL_KEY } from "#/lib/environment/display";

/**
 * What the agent has understood about this company so far.
 *
 * Inferred facts are marked as such rather than blended in with what the user
 * actually said. An assistant that confidently repeats its own guess back as
 * established fact is how people stop trusting it, and by then the wrong fact
 * has already shaped the setup.
 */
export function DiscoveryCard() {
  const { t } = useTranslation("openhands");
  const facts = useOnboardingStudioStore((state) => state.facts);

  const bySection = React.useMemo(() => {
    const map = new Map<string, typeof facts>();
    for (const fact of facts) {
      map.set(fact.section, [...(map.get(fact.section) ?? []), fact]);
    }
    return map;
  }, [facts]);

  return (
    <div
      data-testid="workbench-discovery-card"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="ame-eyebrow">
          {t(I18nKey.ENVIRONMENT$STUDIO_DISCOVERY_TITLE)}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {facts.length}
        </span>
      </div>

      {facts.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ENVIRONMENT$STUDIO_DISCOVERY_EMPTY)}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {COMPANY_PROFILE_SECTION_ORDER.filter((section) =>
            bySection.has(section),
          ).map((section) => (
            <section key={section} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--text-tertiary)]">
                {t(DISCOVERY_SECTION_LABEL_KEY[section])}
              </span>
              <ul className="flex flex-col gap-1">
                {(bySection.get(section) ?? []).map((fact) => (
                  <li
                    key={fact.key}
                    data-testid={`discovery-fact-${fact.key}`}
                    data-confidence={fact.confidence}
                    className="flex items-start gap-2 text-sm text-[var(--text-primary)]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "ame-pip mt-1.5 shrink-0",
                        fact.confidence === "stated" && "ame-pip-success",
                      )}
                    />
                    <span className="min-w-0">
                      {fact.text}
                      {fact.confidence === "inferred" ? (
                        <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">
                          {t(I18nKey.ENVIRONMENT$STUDIO_INFERRED)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
