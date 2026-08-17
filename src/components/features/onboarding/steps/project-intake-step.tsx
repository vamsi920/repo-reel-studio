import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { I18nKey } from "#/i18n/declaration";

interface ProjectIntakeStepProps {
  /** Called once the conversation has been created and navigation has
   * started — the parent marks onboarding complete and unmounts. */
  onLaunched: () => void;
}

/**
 * The entire NeoDevEx onboarding flow: one question, no choices. No agent
 * picker, no LLM picker, no "say hello" placeholder — those are all
 * auto-resolved in the background (default agent profile, Gemini LLM profile
 * seeded by useSeedGeminiDefaultProfile). Onboarding only "starts" — i.e. a
 * real conversation is created — once the user has told us what they're
 * building.
 */
export function ProjectIntakeStep({ onLaunched }: ProjectIntakeStepProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const [project, setProject] = React.useState("");

  const {
    mutate: createConversation,
    isPending,
    isSuccess,
  } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isLaunching = isPending || isSuccess || isCreatingElsewhere;
  const launchInFlightRef = React.useRef(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canSubmit =
    project.trim().length > 0 && !isLaunching && !launchInFlightRef.current;

  const launch = () => {
    if (!canSubmit || launchInFlightRef.current) return;
    launchInFlightRef.current = true;

    const trimmed = project.trim();
    const looksLikeUrlOrRepo =
      /^(https?:\/\/|www\.|[\w.-]+\/[\w.-]+$)/i.test(trimmed) ||
      trimmed.includes("github.com") ||
      trimmed.includes("gitlab.com");

    const query = looksLikeUrlOrRepo
      ? `Here's the project I want to work on: ${trimmed}\n\nPlease start by understanding what it does — clone/investigate it, summarize the structure and key files, then ask me what I'd like to do first.`
      : `Here's what I want to build: ${trimmed}\n\nPlease help me get started — ask any clarifying questions you need first.`;

    createConversation(
      { query, entryPoint: "onboarding_project_intake" },
      {
        onSuccess: (data) => {
          navigate(`/conversations/${data.conversation_id}`);
          onLaunched();
        },
        onError: () => {
          launchInFlightRef.current = false;
        },
      },
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    launch();
  };

  return (
    <div
      data-testid="onboarding-step-project-intake"
      className="flex flex-col items-center gap-8 px-4 py-12 text-center"
    >
      <div className="ame-eyebrow">{t(I18nKey.BRANDING$OPENHANDS)}</div>

      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold text-[var(--text-primary)]">
          {t(I18nKey.ONBOARDING$PROJECT_TITLE)}
        </h1>
        <p className="max-w-md text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ONBOARDING$PROJECT_SUBTITLE)}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="instrument-panel ame-card w-full max-w-xl text-left"
      >
        <div className="ame-card-body flex flex-col gap-4">
          <textarea
            ref={textareaRef}
            data-testid="onboarding-project-input"
            aria-label={t(I18nKey.ONBOARDING$PROJECT_TITLE)}
            value={project}
            onChange={(event) => setProject(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                launch();
              }
            }}
            placeholder={t(I18nKey.ONBOARDING$PROJECT_PLACEHOLDER)}
            disabled={isLaunching}
            rows={3}
            className="ame-input resize-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            data-testid="onboarding-project-submit"
            disabled={!canSubmit}
            className={`ame-btn-primary ame-btn-lg ame-btn-block${isLaunching ? " loading" : ""}`}
          >
            {t(I18nKey.ONBOARDING$PROJECT_START)}
          </button>
        </div>
      </form>
    </div>
  );
}
