import React from "react";
import { useTranslation } from "react-i18next";
import { Dices, Loader2, RefreshCw } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  EXPORT_FORMATS,
  FORMAT_LABELS,
  type ExportFormat,
} from "#/lib/synth/exporters";
import { modelProblems, type Scenario } from "#/lib/synth/model";
import { MAX_ROWS_PER_ENTITY, totalRows } from "#/lib/synth/scenarios";
import type { SynthProject } from "#/stores/synth-studio-store";
import {
  allScenarios,
  DEFAULT_FORMATS,
  randomSeed,
  type GenerateRequest,
} from "#/services/synth-control";

/**
 * The user's own controls: pick a scenario, adjust counts, choose a seed
 * and the formats, press Generate. No agent needed -- the engine runs in
 * the browser -- and the agent's `generate` command ends up in the same
 * run list.
 */
export function GenerateCard({
  project,
  onGenerate,
  busy,
}: {
  project: SynthProject;
  onGenerate: (request: GenerateRequest) => void;
  busy: boolean;
}) {
  const { t } = useTranslation("openhands");
  const scenarios = React.useMemo(() => allScenarios(project), [project]);
  const [scenarioId, setScenarioId] = React.useState(
    scenarios[0]?.id ?? "smoke",
  );
  const scenario: Scenario | undefined =
    scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [seed, setSeed] = React.useState<string>(() => String(randomSeed()));
  const [formats, setFormats] = React.useState<ExportFormat[]>(DEFAULT_FORMATS);
  const [edgeCases, setEdgeCases] = React.useState<boolean | undefined>(
    undefined,
  );
  const [showCounts, setShowCounts] = React.useState(false);

  // A scenario change resets the per-entity overrides to its own counts.
  React.useEffect(() => {
    setCounts({});
    setEdgeCases(undefined);
  }, [scenarioId]);

  const problems = modelProblems(project.model);
  const effective: Scenario | null = scenario
    ? { ...scenario, counts: { ...scenario.counts, ...counts } }
    : null;
  const rows = effective ? totalRows(effective, project.model) : 0;
  const canGenerate = problems.length === 0 && !busy && Boolean(scenario);

  const toggleFormat = (format: ExportFormat) =>
    setFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );

  const submit = () => {
    if (!scenario) return;
    const seedValue = seed.trim();
    onGenerate({
      scenarioId: scenario.id,
      seed: /^\d+$/.test(seedValue)
        ? Number(seedValue)
        : seedValue || undefined,
      formats: formats.length ? formats : DEFAULT_FORMATS,
      counts,
      edgeCases,
    });
  };

  return (
    <section
      data-testid="synth-generate"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow">{t(I18nKey.SYNTH$GENERATE_TITLE)}</span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.SYNTH$ROWS_PLANNED, { count: rows })}
        </span>
      </div>

      {problems.length ? (
        <div
          data-testid="synth-model-problems"
          className="ame-alert ame-alert-warning text-xs"
        >
          <p className="font-medium">{t(I18nKey.SYNTH$MODEL_PROBLEMS)}</p>
          <ul className="list-disc pl-4">
            {problems.slice(0, 6).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label={t(I18nKey.SYNTH$SCENARIO)}
        className="grid grid-cols-2 gap-2"
      >
        {scenarios.map((s) => {
          const active = s.id === scenarioId;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`synth-scenario-${s.id}`}
              onClick={() => setScenarioId(s.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-[var(--radius-sm)] border p-2.5 text-left transition-colors",
                active
                  ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)]"
                  : "border-[var(--border-color)] hover:border-[var(--primary-500)]",
              )}
            >
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {s.name}
              </span>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {t(I18nKey.SYNTH$ROWS_COUNT, {
                  count: totalRows(s, project.model),
                })}
                {s.edgeCases ? ` · ${t(I18nKey.SYNTH$EDGE_CASES)}` : ""}
              </span>
              {s.description ? (
                <span className="text-xs text-[var(--text-secondary)]">
                  {s.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$SEED)}
          <span className="flex items-center gap-1">
            <input
              type="text"
              value={seed}
              data-testid="synth-seed"
              onChange={(e) => setSeed(e.target.value)}
              className="ame-input w-[14ch] rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 font-mono text-xs"
            />
            <button
              type="button"
              aria-label={t(I18nKey.SYNTH$NEW_SEED)}
              data-testid="synth-new-seed"
              onClick={() => setSeed(String(randomSeed()))}
              className="ame-btn-icon ame-btn-icon-sm"
            >
              <RefreshCw size={12} aria-hidden />
            </button>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            data-testid="synth-edge-cases"
            checked={edgeCases ?? Boolean(scenario?.edgeCases)}
            onChange={(e) => setEdgeCases(e.target.checked)}
          />
          {t(I18nKey.SYNTH$EDGE_CASES)}
        </label>
        <button
          type="button"
          data-testid="synth-toggle-counts"
          onClick={() => setShowCounts((v) => !v)}
          className="ame-btn-link text-xs"
        >
          {showCounts
            ? t(I18nKey.SYNTH$HIDE_COUNTS)
            : t(I18nKey.SYNTH$EDIT_COUNTS)}
        </button>
      </div>

      {showCounts && effective ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {project.model.entities.map((entity) => (
            <label
              key={entity.id}
              className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]"
            >
              <span className="truncate">{entity.name}</span>
              <input
                type="number"
                min={0}
                max={MAX_ROWS_PER_ENTITY}
                data-testid={`synth-count-${entity.id}`}
                value={
                  effective.counts[entity.id] ?? effective.defaultCount ?? 10
                }
                onChange={(e) =>
                  setCounts((prev) => ({
                    ...prev,
                    [entity.id]: Math.max(
                      0,
                      Math.min(
                        MAX_ROWS_PER_ENTITY,
                        Number(e.target.value) || 0,
                      ),
                    ),
                  }))
                }
                className="ame-input rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 text-xs"
              />
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$FORMATS)}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {EXPORT_FORMATS.map((format) => {
            const active = formats.includes(format);
            return (
              <button
                key={format}
                type="button"
                role="checkbox"
                aria-checked={active}
                data-testid={`synth-format-${format}`}
                onClick={() => toggleFormat(format)}
                className={cn(
                  "ame-badge cursor-pointer",
                  active ? "ame-badge-primary" : "ame-badge-neutral",
                )}
              >
                {FORMAT_LABELS[format]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--text-tertiary)]">
          {t(I18nKey.SYNTH$REPRODUCIBLE_HINT)}
        </span>
        <button
          type="button"
          disabled={!canGenerate}
          data-testid="synth-generate-button"
          onClick={submit}
          className="ame-btn-primary ame-btn-sm"
        >
          {busy ? (
            <Loader2 size={14} aria-hidden className="animate-spin" />
          ) : (
            <Dices size={14} aria-hidden />
          )}{" "}
          {busy ? t(I18nKey.SYNTH$GENERATING) : t(I18nKey.SYNTH$GENERATE)}
        </button>
      </div>
    </section>
  );
}
