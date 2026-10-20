import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquare } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { resolveDeepWikiRepoTarget } from "#/lib/knowledge/deepwiki-repo-target";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import { withAppRoute } from "#/lib/model-routing/app-side";

/**
 * Repository Q&A next to the generated docs. The KT service answers from the
 * code indexed at the snapshot's commit (full files plus retrieved
 * fragments), so an answer and the docs it sits beside describe the same
 * code.
 */
export function KtAskPanel({ snapshot }: { snapshot: RepositorySnapshot }) {
  const { t } = useTranslation("openhands");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = question.trim();
    if (!content || isAsking) return;
    setIsAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const target = await resolveDeepWikiRepoTarget(snapshot);
      const text = await withAppRoute("kt_ask", (route) =>
        DeepWikiService.chatCompletion({
          repo_url: target.repo_url,
          type: target.type,
          token: target.token,
          provider: route.provider,
          model: route.model,
          messages: [{ role: "user", content }],
        }),
      );
      setAnswer(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <section
      data-testid="kt-ask-panel"
      aria-labelledby="kt-ask-title"
      className="mb-6 rounded-md border border-[var(--oh-border)] p-4"
    >
      <h2
        id="kt-ask-title"
        className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--oh-foreground)]"
      >
        <MessageSquare className="size-4" aria-hidden />
        {t(I18nKey.KT$ASK_TITLE)}
      </h2>
      <p className="mb-3 text-xs text-[var(--oh-muted)]">
        {t(I18nKey.KT$ASK_HELP, { sha: snapshot.commitSha.slice(0, 7) })}
      </p>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t(I18nKey.KT$ASK_PLACEHOLDER)}
          aria-label={t(I18nKey.KT$ASK_TITLE)}
          className="flex-1 rounded-md border border-[var(--oh-border)] bg-transparent px-3 py-2 text-sm text-[var(--oh-foreground)]"
        />
        <button
          type="submit"
          disabled={isAsking || !question.trim()}
          className="rounded-md bg-[var(--primary-500)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t(I18nKey.KT$ASK_SUBMIT)}
        </button>
      </form>
      {isAsking && (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--oh-muted)]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t(I18nKey.KT$ASK_THINKING)}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--error-500)]">
          {t(I18nKey.KT$ASK_ERROR, { error })}
        </p>
      )}
      {answer && (
        <div data-testid="kt-ask-answer" className="mt-3 text-sm">
          <MarkdownRenderer content={answer} includeStandard />
        </div>
      )}
    </section>
  );
}
