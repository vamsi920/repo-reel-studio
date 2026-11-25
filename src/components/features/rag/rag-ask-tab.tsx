import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  RagService,
  type RagAnswerResponse,
  type RagCollection,
  type RagHit,
  type RagSearchResponse,
} from "#/api/rag/rag-service.api";
import { segmentAnswer } from "#/lib/rag/citations";
import {
  ErrorNote,
  SourceKindIcon,
  ragCardClassName,
  ragInputClassName,
  ragMutedClassName,
  ragPrimaryButtonClassName,
} from "./rag-shared";

type Mode = "answer" | "search";

function HitCard({
  hit,
  n,
  highlighted,
}: {
  hit: RagHit;
  n: number;
  highlighted: boolean;
}) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(false);
  const external = hit.uri && /^https?:/.test(hit.uri);
  return (
    <li
      id={`rag-hit-${n}`}
      data-testid="rag-hit"
      className={`${ragCardClassName} flex flex-col gap-1.5 ${highlighted ? "border-[var(--primary-500)]" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-[var(--oh-interactive-hover)] px-1.5 text-xs font-medium text-[var(--text-primary)]">
          {n}
        </span>
        <SourceKindIcon kind={hit.source_kind} size={14} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
          {hit.title}
          {hit.heading_path ? (
            <span className="font-normal text-[var(--text-secondary)]">
              {" "}
              › {hit.heading_path}
            </span>
          ) : null}
        </span>
        {external ? (
          <a
            href={hit.uri!}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--primary-500)] hover:underline"
          >
            {t(I18nKey.RAG$OPEN_SOURCE)}
          </a>
        ) : null}
      </div>
      <p
        className={`whitespace-pre-wrap text-xs text-[var(--text-secondary)] ${open ? "" : "line-clamp-4"}`}
      >
        {hit.content}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        <span data-testid="rag-why">
          {t(I18nKey.RAG$WHY_RETRIEVED, {
            vector: hit.vector_rank ?? "–",
            text: hit.text_rank ?? "–",
            similarity: hit.vector_similarity?.toFixed(2) ?? "–",
          })}
        </span>
        {hit.rerank_score !== null ? (
          <span>
            {t(I18nKey.RAG$RERANK_SCORE, { score: hit.rerank_score })}
          </span>
        ) : null}
        <button
          type="button"
          className="text-[var(--primary-500)] hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t(I18nKey.RAG$SHOW_LESS) : t(I18nKey.RAG$SHOW_MORE)}
        </button>
      </div>
    </li>
  );
}

function AnswerView({ result }: { result: RagAnswerResponse }) {
  const { t } = useTranslation("openhands");
  const [focus, setFocus] = React.useState<number | null>(null);
  const segments = segmentAnswer(result.answer, result.sources.length);
  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="rag-answer"
        className={`${ragCardClassName} text-sm leading-relaxed text-[var(--text-primary)]`}
      >
        {result.found ? (
          <p className="whitespace-pre-wrap">
            {segments.map((segment, i) =>
              segment.kind === "text" ? (
                <React.Fragment key={i}>{segment.text}</React.Fragment>
              ) : (
                <button
                  key={i}
                  type="button"
                  data-testid="rag-citation"
                  onClick={() => {
                    setFocus(segment.n);
                    document
                      .getElementById(`rag-hit-${segment.n}`)
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      });
                  }}
                  className={`mx-0.5 rounded px-1 align-super text-[10px] font-semibold ${
                    segment.valid
                      ? "bg-[var(--primary-500)]/15 text-[var(--primary-500)]"
                      : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {segment.n}
                </button>
              ),
            )}
          </p>
        ) : (
          <p data-testid="rag-not-found" className={ragMutedClassName}>
            {t(I18nKey.RAG$NOT_FOUND_NOTE)}
          </p>
        )}
      </div>
      {result.invalid_citations.length ? (
        <p className="text-xs text-amber-600">
          {t(I18nKey.RAG$INVALID_CITATIONS, {
            list: result.invalid_citations.join(", "),
          })}
        </p>
      ) : null}
      {result.sources.length ? (
        <>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {t(I18nKey.RAG$SOURCES_USED)}
          </h3>
          <ol className="flex flex-col gap-2">
            {result.sources.map((hit, i) => (
              <HitCard
                key={hit.chunk_id}
                hit={hit}
                n={i + 1}
                highlighted={focus === i + 1}
              />
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

export function RagAskTab({ collection }: { collection: RagCollection }) {
  const { t } = useTranslation("openhands");
  const [question, setQuestion] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("answer");
  const [rerank, setRerank] = React.useState(true);
  const [expand, setExpand] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [answer, setAnswer] = React.useState<RagAnswerResponse | null>(null);
  const [search, setSearch] = React.useState<RagSearchResponse | null>(null);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (question.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setSearch(null);
    try {
      if (mode === "answer") {
        setAnswer(
          await RagService.answer([collection.id], question, {
            rerank,
            expand,
          }),
        );
      } else {
        setSearch(
          await RagService.search([collection.id], question, {
            rerank,
            expand,
            k: 10,
          }),
        );
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const timings = answer?.timings ?? search?.timings;

  return (
    <div data-testid="rag-ask-tab" className="flex flex-col gap-3">
      <form onSubmit={ask} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            data-testid="rag-question"
            className={ragInputClassName}
            value={question}
            maxLength={2000}
            placeholder={t(I18nKey.RAG$ASK_PLACEHOLDER)}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            type="submit"
            data-testid="rag-ask"
            className={ragPrimaryButtonClassName}
            disabled={busy || question.trim().length < 2}
          >
            {t(I18nKey.RAG$ASK)}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-primary)]">
          <div
            role="radiogroup"
            className="flex overflow-hidden rounded-md border border-[var(--border-color)]"
          >
            {(["answer", "search"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                data-testid={`rag-mode-${m}`}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs ${mode === m ? "bg-[var(--primary-500)] text-white" : "text-[var(--text-secondary)]"}`}
              >
                {m === "answer"
                  ? t(I18nKey.RAG$MODE_ANSWER)
                  : t(I18nKey.RAG$MODE_SEARCH)}
              </button>
            ))}
          </div>
          <label
            className="flex items-center gap-1.5"
            title={t(I18nKey.RAG$OPTION_RERANK_HINT)}
          >
            <input
              type="checkbox"
              checked={rerank}
              onChange={(e) => setRerank(e.target.checked)}
            />
            {t(I18nKey.RAG$OPTION_RERANK)}
          </label>
          <label
            className="flex items-center gap-1.5"
            title={t(I18nKey.RAG$OPTION_EXPAND_HINT)}
          >
            <input
              type="checkbox"
              data-testid="rag-expand"
              checked={expand}
              onChange={(e) => setExpand(e.target.checked)}
            />
            {t(I18nKey.RAG$OPTION_EXPAND)}
          </label>
          {timings?.total_ms ? (
            <span className="ml-auto text-xs text-[var(--text-secondary)]">
              {t(I18nKey.RAG$TIMINGS, { total: timings.total_ms })}
            </span>
          ) : null}
        </div>
      </form>
      {busy ? (
        <p className={ragMutedClassName}>{t(I18nKey.RAG$THINKING)}</p>
      ) : null}
      <ErrorNote error={error} />
      {answer ? <AnswerView result={answer} /> : null}
      {search ? (
        search.results.length ? (
          <ol className="flex flex-col gap-2">
            {search.results.map((hit, i) => (
              <HitCard
                key={hit.chunk_id}
                hit={hit}
                n={i + 1}
                highlighted={false}
              />
            ))}
          </ol>
        ) : (
          <p className={ragMutedClassName}>{t(I18nKey.RAG$NOT_FOUND_NOTE)}</p>
        )
      ) : null}
    </div>
  );
}
