import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { PanelRight } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import {
  useOnboardingStudioStore,
  type WorkbenchCard,
} from "#/stores/onboarding-studio-store";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";
import type { PostResultFn } from "#/services/onboarding-control";
import { DiscoveryCard } from "./cards/discovery-card";
import { SetupPlanCard } from "./cards/setup-plan-card";
import { ConnectionCard } from "./cards/connection-card";
import {
  ChecklistCard,
  HandoffCard,
  ProbeCard,
  ProposalCard,
  ProviderPickerCard,
  SummaryCard,
} from "./cards/simple-cards";

/**
 * The panel beside the conversation.
 *
 * Everything the agent produces lands here in the order it happened, and the
 * conversation never navigates away. That is the entire correction to the
 * first implementation, which teleported the user to a form grid the moment
 * the agent wanted to show providers.
 */
export function OnboardingWorkbench({
  postResult,
}: {
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const cards = useOnboardingStudioStore((state) => state.cards);
  const { data: profile } = useEnvironmentProfile();
  const readiness = useEnvironmentReadiness(profile ?? null);

  const renderCard = (card: WorkbenchCard) => {
    switch (card.kind) {
      case "discovery":
        return <DiscoveryCard />;
      case "plan":
        return <SetupPlanCard />;
      case "picker":
        return <ProviderPickerCard card={card} postResult={postResult} />;
      case "form":
        return <ConnectionCard card={card} postResult={postResult} />;
      case "probe":
        return <ProbeCard card={card} />;
      case "proposal":
        return <ProposalCard card={card} postResult={postResult} />;
      case "checklist":
        return <ChecklistCard card={card} />;
      case "handoff":
        return <HandoffCard card={card} />;
      case "summary":
        return (
          <SummaryCard
            readinessScore={readiness.score}
            blockingCount={readiness.blocking.length}
          />
        );
      default: {
        // Exhaustiveness guard: a new card kind must be rendered here rather
        // than silently vanishing from the panel.
        const never: never = card;
        return never;
      }
    }
  };

  return (
    <div
      data-testid="onboarding-workbench"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-4 py-2.5">
        <PanelRight
          size={14}
          aria-hidden
          className="text-[var(--primary-500)]"
        />
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {t(I18nKey.ENVIRONMENT$STUDIO_WORKBENCH)}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {cards.length === 0 ? (
          <div
            data-testid="workbench-empty"
            className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] p-6 text-center"
          >
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {t(I18nKey.ENVIRONMENT$STUDIO_EMPTY_TITLE)}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {t(I18nKey.ENVIRONMENT$STUDIO_EMPTY_BODY)}
            </span>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <motion.div
              key={card.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            >
              {renderCard(card)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
