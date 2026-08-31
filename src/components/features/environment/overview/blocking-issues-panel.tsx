import { useTranslation } from "react-i18next";
import { CheckCircle2, Wand2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { ReadinessItem } from "#/lib/environment/types/requirements";
import { SEVERITY_LABEL_KEY } from "#/lib/environment/display";
import {
  useRequirementLabel,
  requirementScopeHint,
} from "../shared/requirement-label";

export interface BlockingIssuesPanelProps {
  titleKey: I18nKey;
  emptyKey: I18nKey;
  items: ReadinessItem[];
  tone: "blocking" | "degrading" | "unknown";
  onFixWithAgent?: (item: ReadinessItem) => void;
  testId: string;
}

const TONE_CLASS: Record<BlockingIssuesPanelProps["tone"], string> = {
  blocking: "border-l-[var(--error-500)]",
  degrading: "border-l-[var(--warning-500)]",
  unknown: "border-l-[var(--border-color)]",
};

export function BlockingIssuesPanel({
  titleKey,
  emptyKey,
  items,
  tone,
  onFixWithAgent,
  testId,
}: BlockingIssuesPanelProps) {
  const { t } = useTranslation("openhands");
  const labelFor = useRequirementLabel();

  return (
    <section data-testid={testId} className="ame-card flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {t(titleKey)}
        </h3>
        <span className="text-xs text-[var(--text-tertiary)]">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <CheckCircle2
            size={14}
            aria-hidden
            className="text-[var(--success-500)]"
          />
          {t(emptyKey)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const scope = requirementScopeHint(item.node);
            return (
              <li
                key={item.id}
                data-testid={`readiness-item-${item.id}`}
                className={cn(
                  "flex items-start justify-between gap-3 border-l-2 bg-[var(--background-secondary)] px-3 py-2",
                  "rounded-r-[var(--radius-sm)]",
                  TONE_CLASS[tone],
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm text-[var(--text-primary)]">
                    {labelFor(item.node)}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {`${t(item.featureNameKey)} · ${t(SEVERITY_LABEL_KEY[item.severity])}${scope ? ` · ${scope}` : ""}`}
                  </span>
                  {item.degradesToKey && tone === "degrading" ? (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {t(item.degradesToKey)}
                    </span>
                  ) : null}
                </div>
                {onFixWithAgent ? (
                  <button
                    type="button"
                    data-testid={`fix-with-agent-${item.id}`}
                    onClick={() => onFixWithAgent(item)}
                    className="ame-btn-ghost ame-btn-xs inline-flex shrink-0 items-center gap-1.5"
                  >
                    <Wand2 size={12} aria-hidden />
                    {t(I18nKey.ENVIRONMENT$FIX_WITH_AGENT)}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {tone === "unknown" && items.length > 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.ENVIRONMENT$UNKNOWN_HELP)}
        </p>
      ) : null}
    </section>
  );
}
