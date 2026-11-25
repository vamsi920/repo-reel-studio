import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import { RagService, type RagCollection } from "#/api/rag/rag-service.api";
import {
  computeMetrics,
  firstHitRank,
  type EvalCaseResult,
  type EvalMetrics,
} from "#/lib/rag/evaluate";
import {
  ErrorNote,
  RAG_QUERY_KEYS,
  formatWhen,
  ragCardClassName,
  ragInputClassName,
  ragMutedClassName,
  ragPrimaryButtonClassName,
  ragSecondaryButtonClassName,
} from "./rag-shared";

function pct(x: number | undefined): string {
  return `${Math.round((x ?? 0) * 100)}%`;
}

function MetricTiles({ metrics }: { metrics: Partial<EvalMetrics> }) {
  const { t } = useTranslation("openhands");
  const tiles: [I18nKey, string][] = [
    [I18nKey.RAG$METRIC_RECALL1, pct(metrics.recallAt1)],
    [I18nKey.RAG$METRIC_RECALL3, pct(metrics.recallAt3)],
    [I18nKey.RAG$METRIC_RECALL5, pct(metrics.recallAt5)],
    [I18nKey.RAG$METRIC_MRR, (metrics.mrr ?? 0).toFixed(2)],
  ];
  return (
    <div
      data-testid="rag-metrics"
      className="grid grid-cols-2 gap-2 md:grid-cols-4"
    >
      {tiles.map(([label, value]) => (
        <div key={label} className={`${ragCardClassName} flex flex-col`}>
          <span className="text-xs text-[var(--text-secondary)]">
            {t(label)}
          </span>
          <span className="text-lg font-semibold text-[var(--text-primary)]">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RagQualityTab({ collection }: { collection: RagCollection }) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const [question, setQuestion] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [running, setRunning] = React.useState<{
    done: number;
    total: number;
  } | null>(null);
  const [results, setResults] = React.useState<EvalCaseResult[] | null>(null);
  const [error, setError] = React.useState<unknown>(null);

  const cases = useQuery({
    queryKey: RAG_QUERY_KEYS.evalCases(collection.id),
    queryFn: () => RagService.listEvalCases(collection.id),
  });
  const runs = useQuery({
    queryKey: RAG_QUERY_KEYS.evalRuns(collection.id),
    queryFn: () => RagService.listEvalRuns(collection.id),
  });

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (question.trim().length < 3 || !expected.trim()) return;
    setError(null);
    try {
      await RagService.addEvalCase(
        collection.id,
        collection.org_id,
        question,
        expected,
      );
      setQuestion("");
      setExpected("");
      void queryClient.invalidateQueries({
        queryKey: RAG_QUERY_KEYS.evalCases(collection.id),
      });
    } catch (e) {
      setError(e);
    }
  };

  const run = async () => {
    const list = cases.data ?? [];
    if (!list.length) return;
    setError(null);
    setResults(null);
    const out: EvalCaseResult[] = [];
    try {
      for (let i = 0; i < list.length; i += 1) {
        setRunning({ done: i, total: list.length });
        // Plain hybrid search, no re-rank: this measures the retriever itself.

        const response = await RagService.search(
          [collection.id],
          list[i].question,
          { k: 5, rerank: false },
        );
        out.push({
          id: list[i].id,
          question: list[i].question,
          expected: list[i].expected,
          rank: firstHitRank(response.results, list[i].expected),
          topTitle: response.results[0]?.title ?? null,
        });
      }
      setResults(out);
      await RagService.saveEvalRun(
        collection.id,
        collection.org_id,
        computeMetrics(out),
        out,
      );
      void queryClient.invalidateQueries({
        queryKey: RAG_QUERY_KEYS.evalRuns(collection.id),
      });
    } catch (e) {
      setError(e);
    } finally {
      setRunning(null);
    }
  };

  const rankById = new Map((results ?? []).map((r) => [r.id, r.rank]));

  return (
    <div data-testid="rag-quality-tab" className="flex flex-col gap-3">
      <p className={ragMutedClassName}>{t(I18nKey.RAG$QUALITY_INTRO)}</p>
      <form
        onSubmit={add}
        className={`${ragCardClassName} flex flex-col gap-2`}
      >
        <input
          data-testid="rag-eval-question"
          className={ragInputClassName}
          placeholder={t(I18nKey.RAG$QUESTION)}
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <input
          data-testid="rag-eval-expected"
          className={ragInputClassName}
          placeholder={t(I18nKey.RAG$EXPECTED)}
          value={expected}
          maxLength={500}
          onChange={(e) => setExpected(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            data-testid="rag-eval-add"
            className={ragSecondaryButtonClassName}
            disabled={question.trim().length < 3 || !expected.trim()}
          >
            {t(I18nKey.RAG$ADD_CASE)}
          </button>
          <button
            type="button"
            data-testid="rag-eval-run"
            className={ragPrimaryButtonClassName}
            disabled={!cases.data?.length || running !== null}
            onClick={() => void run()}
          >
            {running
              ? t(I18nKey.RAG$RUNNING_EVAL, {
                  done: running.done + 1,
                  total: running.total,
                })
              : t(I18nKey.RAG$RUN_EVAL)}
          </button>
        </div>
      </form>
      <ErrorNote error={error} />
      {results ? (
        <>
          <MetricTiles metrics={computeMetrics(results)} />
          <p className="text-xs text-[var(--text-secondary)]">
            {t(I18nKey.RAG$METRICS_HINT)}
          </p>
        </>
      ) : null}
      {cases.data && cases.data.length === 0 ? (
        <p className={ragMutedClassName}>{t(I18nKey.RAG$EMPTY_CASES)}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {(cases.data ?? []).map((c) => {
          const rank = rankById.get(c.id);
          return (
            <li
              key={c.id}
              data-testid="rag-eval-case"
              className={`${ragCardClassName} flex items-start gap-3`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-primary)]">
                  {c.question}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  “{c.expected}”
                </p>
              </div>
              {rank !== undefined ? (
                <span
                  data-testid="rag-eval-rank"
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${rank ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}
                >
                  {rank
                    ? t(I18nKey.RAG$RANK, { rank })
                    : t(I18nKey.RAG$NOT_RETRIEVED)}
                </span>
              ) : null}
              <button
                type="button"
                className="shrink-0 text-xs text-[var(--text-secondary)] hover:text-red-600"
                onClick={async () => {
                  await RagService.deleteEvalCase(c.id).catch(setError);
                  void queryClient.invalidateQueries({
                    queryKey: RAG_QUERY_KEYS.evalCases(collection.id),
                  });
                }}
              >
                {t(I18nKey.RAG$REMOVE)}
              </button>
            </li>
          );
        })}
      </ul>
      {runs.data && runs.data.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {t(I18nKey.RAG$PAST_RUNS)}
          </h3>
          <ul className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            {runs.data.map((r) => (
              <li key={r.id} data-testid="rag-eval-run-row">
                {formatWhen(r.created_at)} · {t(I18nKey.RAG$METRIC_RECALL1)}{" "}
                {pct(r.metrics.recallAt1)} · {t(I18nKey.RAG$METRIC_RECALL3)}{" "}
                {pct(r.metrics.recallAt3)} · {t(I18nKey.RAG$METRIC_RECALL5)}{" "}
                {pct(r.metrics.recallAt5)} · {t(I18nKey.RAG$METRIC_MRR)}{" "}
                {(r.metrics.mrr ?? 0).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
