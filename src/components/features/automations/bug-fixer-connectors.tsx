import { useState } from "react";
import { Bug, Loader2 } from "lucide-react";
import { FaGithub } from "react-icons/fa6";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useTracking } from "#/hooks/use-tracking";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { useImportAutomation } from "#/hooks/query/use-automations";
import { automationDetailPath } from "#/manifests/automation-interface";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import type { AutomationSpec } from "#/types/automation";

type BugFixerSource = "github" | "jira";

/**
 * The agent-ops-style methodology every Bug Fixer connector encodes: research
 * the real cause before touching code, patch, then loop tests until green,
 * and only open a PR once verification actually passes. Never open a PR on a
 * hunch.
 */
function buildBugFixerPrompt(
  source: BugFixerSource,
  repository: string,
): string {
  const sourceLabel = source === "github" ? "GitHub Issues" : "Jira";

  return [
    `A ${sourceLabel} issue triggered this run in ${repository}. The trigger payload only carries the event, not the full issue.`,
    "",
    `First, use your ${sourceLabel} tool/MCP connection to fetch the real issue named in the trigger payload — title, full description, comments, and labels. If that tool isn't connected yet, stop and say exactly what needs to be connected instead of guessing at the issue's contents.`,
    "",
    "Then follow this workflow, in order, and do not skip a step:",
    "1. Research — reproduce the bug from the real codebase and identify the actual root cause before writing any code. Do not guess.",
    "2. Patch — make the smallest correct change that fixes the root cause. No unrelated refactors.",
    "3. Test loop — run the existing test suite (add a regression test for this bug if none covers it), and keep iterating until everything is green. Do not stop on a red run.",
    "4. Verify — re-check the original repro steps against the fix.",
    "5. Only after verification passes, open a pull request. Never open a PR from a failing or unverified state.",
    "",
    "If the KT Video feature is available in this workspace, generate a short KT video walkthrough of the fix for the PR description so reviewers can see what changed and why without reading the whole diff.",
  ].join("\n");
}

function buildAutomationSpec(
  source: BugFixerSource,
  repository: string,
): AutomationSpec {
  const trimmedRepo = repository.trim();
  return {
    name:
      source === "github"
        ? `Bug Fixer — ${trimmedRepo} (GitHub Issues)`
        : `Bug Fixer — ${trimmedRepo} (Jira)`,
    trigger: {
      type: "event",
      source,
      on:
        source === "github"
          ? ["issues.labeled", "issues.opened"]
          : ["issue.created"],
    },
    enabled: false,
    repository: trimmedRepo,
    prompt: buildBugFixerPrompt(source, trimmedRepo),
  };
}

interface BugFixerCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  testId: string;
}

function BugFixerCard({
  icon,
  title,
  description,
  onClick,
  testId,
}: BugFixerCardProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-start gap-2 rounded-xl border border-[var(--oh-border)]",
        "bg-[var(--oh-surface)] p-4 text-left transition-colors hover:bg-[var(--oh-interactive-hover)]",
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary-bg-subtle)] text-[var(--primary-400)]">
        {icon}
      </span>
      <span className="text-sm font-medium text-[var(--oh-foreground)]">
        {title}
      </span>
      <span className="text-xs leading-relaxed text-[var(--oh-muted)]">
        {description}
      </span>
    </button>
  );
}

function RepositoryPromptModal({
  source,
  onClose,
  onCreated,
}: {
  source: BugFixerSource;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("openhands");
  const [repository, setRepository] = useState("");
  const importAutomation = useImportAutomation();

  const placeholder =
    source === "github"
      ? "owner/repo (e.g. neodevex/repo-reel-studio)"
      : "PROJECT_KEY";
  const label =
    source === "github"
      ? t(I18nKey.AUTOMATIONS$BUG_FIXER_GITHUB_TITLE)
      : t(I18nKey.AUTOMATIONS$BUG_FIXER_JIRA_TITLE);

  const handleCreate = () => {
    if (!repository.trim() || importAutomation.isPending) return;
    const spec = buildAutomationSpec(source, repository);
    importAutomation.mutate(spec, {
      onSuccess: (created) => {
        displaySuccessToast(t(I18nKey.AUTOMATIONS$BUG_FIXER_CREATED_TOAST));
        onCreated(created.id);
      },
      onError: (error) => {
        displayErrorToast(
          error instanceof Error ? error.message : String(error),
        );
      },
    });
  };

  return (
    <ModalBackdrop
      onClose={importAutomation.isPending ? undefined : onClose}
      closeOnEscape={!importAutomation.isPending}
      closeOnBackdropClick={!importAutomation.isPending}
      aria-label={label}
    >
      <div
        data-testid="bug-fixer-repository-modal"
        className="relative flex w-[min(28rem,calc(100vw-2rem))] flex-col rounded-xl border border-[var(--oh-border)] bg-base-secondary"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="bug-fixer-repository-modal-close"
          disabled={importAutomation.isPending}
        />
        <header className="px-6 pb-4 pt-6">
          <h2 className={cn("pr-6", modalTitleLgClassName)}>{label}</h2>
          <p className="mt-2 text-sm text-tertiary-light">
            {t(I18nKey.AUTOMATIONS$BUG_FIXER_REPO_PROMPT)}
          </p>
        </header>
        <div className="px-6 py-5">
          <input
            type="text"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder={placeholder}
            data-testid="bug-fixer-repository-input"
            className="w-full rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-foreground)] outline-none focus:border-[var(--primary-400)]"
          />
        </div>
        <footer className="flex justify-end gap-3 px-6 py-5">
          <BrandButton
            testId="bug-fixer-repository-cancel"
            type="button"
            variant="secondary"
            onClick={onClose}
            isDisabled={importAutomation.isPending}
          >
            {t(I18nKey.AUTOMATIONS$CANCEL)}
          </BrandButton>
          <BrandButton
            testId="bug-fixer-repository-confirm"
            type="button"
            variant="primary"
            onClick={handleCreate}
            isDisabled={!repository.trim() || importAutomation.isPending}
            aria-busy={importAutomation.isPending}
          >
            {importAutomation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              t(I18nKey.AUTOMATIONS$BUG_FIXER_CREATE_BUTTON)
            )}
          </BrandButton>
        </footer>
      </div>
    </ModalBackdrop>
  );
}

/**
 * Neo Bug Fixer connectors. One click creates a real, persisted
 * automation (via the same `createAutomation` API the Import flow uses) with
 * a GitHub- or Jira-issue event trigger and an agent-ops-style prompt
 * (research → patch → test loop → verify → PR only when green) baked in.
 * The automation is created disabled, matching Import's own safety default —
 * review it on its detail page, then turn it on.
 */
export function BugFixerConnectors() {
  const { t } = useTranslation("openhands");
  const { trackAutomationCreatedButton } = useTracking();
  const { backend } = useActiveBackend();
  const { navigate } = useNavigation();
  const [activeSource, setActiveSource] = useState<BugFixerSource | null>(null);

  const openModal = (source: BugFixerSource) => {
    trackAutomationCreatedButton({ backendKind: backend.kind });
    setActiveSource(source);
  };

  return (
    <section className="flex flex-col gap-3" data-testid="bug-fixer-connectors">
      <div>
        <h2 className="text-sm font-semibold text-[var(--oh-foreground)]">
          {t(I18nKey.AUTOMATIONS$BUG_FIXER_TITLE)}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
          {t(I18nKey.AUTOMATIONS$BUG_FIXER_DESC)}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <BugFixerCard
          icon={<FaGithub size={16} aria-hidden />}
          title={t(I18nKey.AUTOMATIONS$BUG_FIXER_GITHUB_TITLE)}
          description={t(I18nKey.AUTOMATIONS$BUG_FIXER_GITHUB_DESC)}
          onClick={() => openModal("github")}
          testId="bug-fixer-connect-github"
        />
        <BugFixerCard
          icon={<Bug className="size-4" aria-hidden />}
          title={t(I18nKey.AUTOMATIONS$BUG_FIXER_JIRA_TITLE)}
          description={t(I18nKey.AUTOMATIONS$BUG_FIXER_JIRA_DESC)}
          onClick={() => openModal("jira")}
          testId="bug-fixer-connect-jira"
        />
      </div>
      {activeSource && (
        <RepositoryPromptModal
          source={activeSource}
          onClose={() => setActiveSource(null)}
          onCreated={(id) => {
            setActiveSource(null);
            navigate?.(automationDetailPath(id));
          }}
        />
      )}
    </section>
  );
}
