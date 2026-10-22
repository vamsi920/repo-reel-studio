import type {
  OpenHandsEvent,
  SynthControlAction,
} from "#/types/agent-server/core";
import {
  isMessageEvent,
  isSynthControlActionEvent,
} from "#/types/agent-server/type-guards";
import {
  SYNTH_CONTROL_COMMANDS,
  SYNTH_RESULT_PREFIX,
  type SynthControlCommand,
} from "#/constants/synth-control";
import {
  cacheRun,
  newSynthId,
  PREVIEW_ROWS,
  useSynthStudioStore,
  type ChoiceOption,
  type ChoiceQuestion,
  type RunVerification,
  type SynthProject,
  type SynthRun,
} from "#/stores/synth-studio-store";
import {
  FIELD_TYPES,
  PII_CLASSES,
  PRIVACY_TREATMENTS,
  SEMANTIC_KINDS,
  findEntity,
  modelProblems,
  relationsOf,
  slugId,
  type DataFlow,
  type Distribution,
  type Entity,
  type Field,
  type FieldType,
  type PiiClass,
  type PrivacyTreatment,
  type Rule,
  type RuleSpec,
  type Scenario,
  type ScenarioOverride,
  type SemanticKind,
} from "#/lib/synth/model";
import { normalizeType, withInferredSemantics } from "#/lib/synth/semantics";
import { generateDataset, datasetSummary } from "#/lib/synth/generate";
import { validateDataset } from "#/lib/synth/validate";
import {
  EXPORT_FORMATS,
  exportDataset,
  totalBytes,
  type ExportFormat,
} from "#/lib/synth/exporters";
import { privacyReport, privacyReportMarkdown } from "#/lib/synth/privacy";
import {
  builtinScenarios,
  clampScenario,
  MAX_ROWS_PER_ENTITY,
  MAX_ROWS_PER_RUN,
  scaleToTotal,
  totalRows,
} from "#/lib/synth/scenarios";
import { parseSchemaFile } from "#/lib/synth/parsers";
import {
  findSchemaFiles,
  MAX_WORKSPACE_BYTES,
  readWorkspaceFile,
  SYNTH_OUTPUT_DIR,
  writeRunToWorkspace,
} from "#/lib/synth/workspace";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

/**
 * Dispatcher for the `synth_control` client tool (Neo Synth).
 *
 * Mirrors `modernization-control.ts`: every command mutates the studio
 * store (which the workbench renders) and posts a receipt back into the
 * conversation, because the agent-server acknowledges client tools before
 * the browser does any work. A rejecting receipt always says what would
 * have been valid.
 *
 * The important difference from Neo ME: generation is done HERE, by the
 * engine, never by the agent. The agent supplies the model; the studio
 * produces, validates and exports the data and reports the real result.
 */

export type PostResultFn = (message: string) => void;

export interface DispatchContext {
  postResult: PostResultFn;
  conversationId?: string;
  /** Runs a shell command in the project's workspace, when attached to a runtime. */
  runInWorkspace?: RunInWorkspace;
  /**
   * Id of the ActionEvent being dispatched. When set, the command runs at
   * most once per project (a reconnect replays the same event id).
   */
  actionId?: string;
  /** Clock override for tests. */
  now?: () => number;
}

export const RECEIPT_NEXT_STEP =
  "Act on this now: call the next synth_control command, or write to the user. Do not reply empty.";

export function withNextStep(message: string): string {
  if (!message.startsWith(SYNTH_RESULT_PREFIX)) return message;
  try {
    const payload = JSON.parse(message.slice(SYNTH_RESULT_PREFIX.length));
    if (!payload || typeof payload !== "object" || "next" in payload)
      return message;
    return `${SYNTH_RESULT_PREFIX}${JSON.stringify({ ...payload, next: RECEIPT_NEXT_STEP })}`;
  } catch {
    return message;
  }
}

export function createSynthResultPoster(conversationId: string): PostResultFn {
  return (message: string) => {
    void AgentServerConversationService.sendMessage(conversationId, {
      role: "user",
      content: [{ type: "text", text: withNextStep(message) }],
    }).catch(() => {
      // The workbench already shows the outcome; a lost receipt must not
      // break the dispatch.
    });
  };
}

export function receipt(payload: Record<string, unknown>): string {
  return `${SYNTH_RESULT_PREFIX}${JSON.stringify(payload)}`;
}

function postReceipt(
  context: DispatchContext,
  payload: Record<string, unknown>,
) {
  context.postResult(receipt(payload));
}

function isCommand(value: string): value is SynthControlCommand {
  return (SYNTH_CONTROL_COMMANDS as readonly string[]).includes(value);
}

function payloadOf(action: SynthControlAction): Record<string, unknown> {
  const payload = action.payload;
  return payload && typeof payload === "object" ? payload : {};
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const bool = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : undefined;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** The project a conversation belongs to (the studio sets conversationId at start). */
export function findProjectForConversation(
  conversationId: string | undefined,
): SynthProject | null {
  if (!conversationId) return null;
  const { projects, activeProjectId } = useSynthStudioStore.getState();
  const byConversation = Object.values(projects).find(
    (p) => p.conversationId === conversationId,
  );
  if (byConversation) return byConversation;
  return activeProjectId ? (projects[activeProjectId] ?? null) : null;
}

/** Payload shapes, handed to the agent by `describe`. */
export const COMMAND_SHAPES = Object.freeze({
  describe: "{}",
  import_schema:
    "{paths:[string]} (workspace-relative; schema.prisma, *.sql, openapi.json, *.schema.json)",
  record_model:
    "{entities:[{id?, name, table?, description?, evidence:[string], fields:[{name, type: string|text|integer|float|decimal|boolean|date|datetime|time|uuid|json|enum|bytes|array (or any SQL/ORM type word), semantic?: email|first_name|full_name|phone|url|price|amount|status|created_at|... , nullable?, unique?, primary_key?, generated?, references?: {entity, field} | 'entity.field', enum_values?:[string], min?, max?, max_length?, pattern?, description?, pii?: direct|quasi|sensitive|none, treatment?: synthesize|mask|redact (only after the user chose it), context?: string, examples?:[string]}], unique_together?:[[field]]}], replace?: boolean}",
  record_rules:
    "{rules:[{id?, entity, description, evidence?:[string], spec: {kind:'implies', if:{field, in?:[...], isNull?}, then:{field, isNull?, in?:[...], equals?}} | {kind:'compare', field, op:'<'|'<='|'>'|'>='|'==', other} | {kind:'unique_together', fields:[...]} | {kind:'range', field, min?, max?} | {kind:'pattern', field, pattern}}]}",
  record_flows:
    "{flows:[{id?, name, from, to, via?, entities:[entity ids], description?, evidence?:[string]}]}",
  record_profile:
    "{entity, field, distribution: {kind:'categorical', weights:{label: count}} | {kind:'normal', mean, stddev} | {kind:'uniform', min, max} | {kind:'null_rate', rate}} -- labels and statistics only, never sampled personal values",
  ask_choice:
    "{question_id, title, prompt?, kind: single|multi, options:[{id, label, description?, recommended?}], allow_other?: boolean} -> wait for {status:'answered', question_id, selected, other?}",
  set_scenarios:
    "{scenarios:[{id?, name, description?, counts:{entity_id: rows}, default_count?, edge_cases?: boolean, null_rate?, parent_distribution?: uniform|skewed, overrides?:[{entity, field, values?:[...], weights?:{value: weight}, share?, null_rate?}]}]}",
  generate: `{scenario_id?: smoke|realistic|edge_cases|load|<custom id>, seed?: number|string, formats?: [${EXPORT_FORMATS.join("|")}], counts?: {entity_id: rows}, total_rows?: number (spread over tables in the scenario's proportions, max ${MAX_ROWS_PER_RUN}), edge_cases?: boolean, write?: boolean (default true)} -> the studio generates, validates, exports and writes ${SYNTH_OUTPUT_DIR}/<run id>/; the receipt carries validation and paths`,
  report_verification:
    "{run_id, loaded_into?: string (database / fixture / test suite), rows_loaded?, tests_total?, tests_passing?, notes?}",
  log: "{text, level?: info|warn|error|success}",
  complete: "{summary, artifacts?:[paths]}",
});

/* ── Parsing payloads ──────────────────────────────────────────────────── */

function fieldTypeOf(value: unknown): FieldType {
  const raw = str(value)?.toLowerCase();
  if (!raw) return "unknown";
  if ((FIELD_TYPES as readonly string[]).includes(raw)) return raw as FieldType;
  return normalizeType(raw);
}

function semanticOf(value: unknown): SemanticKind | undefined {
  const raw = str(value)?.toLowerCase();
  return raw && (SEMANTIC_KINDS as readonly string[]).includes(raw)
    ? (raw as SemanticKind)
    : undefined;
}

function referenceOf(value: unknown): Field["references"] | undefined {
  if (typeof value === "string") {
    const [entity, field] = value.split(".");
    if (!entity) return undefined;
    return { entity: slugId(entity), field: field?.trim() || "id" };
  }
  const o = obj(value);
  const entity = o
    ? (str(o.entity) ?? str(o.model) ?? str(o.table))
    : undefined;
  if (!entity) return undefined;
  return { entity: slugId(entity), field: (o && str(o.field)) ?? "id" };
}

function parseFields(
  raw: unknown,
  skipped: string[],
  entityName: string,
): Field[] {
  const fields: Field[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = obj(entry);
    const name = e ? (str(e.name) ?? str(e.column)) : undefined;
    if (!e || !name) {
      skipped.push(`${entityName}: field without a name`);
      continue;
    }
    const field: Field = { name, type: fieldTypeOf(e.type) };
    const semantic = semanticOf(e.semantic);
    if (semantic) field.semantic = semantic;
    const nullable =
      bool(e.nullable) ??
      (bool(e.required) === undefined ? undefined : !bool(e.required));
    if (nullable !== undefined) field.nullable = nullable;
    if (bool(e.unique) !== undefined) field.unique = bool(e.unique);
    if (bool(e.primary_key) ?? bool(e.primaryKey)) {
      field.primaryKey = true;
      field.unique = true;
      field.nullable = false;
    }
    if (bool(e.generated) !== undefined) field.generated = bool(e.generated);
    const ref = referenceOf(e.references ?? e.reference ?? e.foreign_key);
    if (ref) field.references = ref;
    const enumValues = strList(e.enum_values ?? e.enum ?? e.values);
    if (enumValues.length) {
      field.enumValues = enumValues;
      if (field.type === "unknown" || field.type === "string")
        field.type = "enum";
    }
    if (num(e.min) !== undefined) field.min = num(e.min);
    if (num(e.max) !== undefined) field.max = num(e.max);
    if (num(e.max_length ?? e.maxLength) !== undefined)
      field.maxLength = num(e.max_length ?? e.maxLength);
    if (num(e.scale) !== undefined) field.scale = num(e.scale);
    if (str(e.pattern)) field.pattern = str(e.pattern);
    if (str(e.description)) field.description = str(e.description);
    const pii =
      e.pii === true
        ? "direct"
        : e.pii === false
          ? "none"
          : str(e.pii)?.toLowerCase();
    if (pii && (PII_CLASSES as readonly string[]).includes(pii)) {
      field.pii = pii as PiiClass;
    }
    const treatment = str(e.treatment)?.toLowerCase();
    if (
      treatment &&
      (PRIVACY_TREATMENTS as readonly string[]).includes(treatment)
    ) {
      field.treatment = treatment as PrivacyTreatment;
    }
    if (str(e.context)) field.context = str(e.context)!.slice(0, 500);
    const examples = strList(e.examples)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (examples.length) field.examples = examples;
    if (e.default !== undefined) field.defaultValue = e.default;
    if (field.type === "unknown") {
      // Let the name decide: ids are integers, *_at are datetimes, else string.
      if (/_id$|^id$/.test(name))
        field.type = field.references ? "unknown" : "integer";
      else if (/_at$|_on$/.test(name)) field.type = "datetime";
      else field.type = "string";
    }
    if (field.references && field.type === "unknown") field.type = "integer";
    fields.push(field);
  }
  return fields;
}

function parseEntities(raw: unknown): {
  entities: Entity[];
  skipped: string[];
} {
  const entities: Entity[] = [];
  const skipped: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = obj(entry);
    const name = e ? (str(e.name) ?? str(e.table)) : undefined;
    if (!e || !name) {
      skipped.push("entity without a name");
      continue;
    }
    const fields = parseFields(e.fields ?? e.columns, skipped, name);
    if (fields.length === 0) {
      skipped.push(`${name}: no fields`);
      continue;
    }
    const uniqueTogether = Array.isArray(e.unique_together)
      ? (e.unique_together as unknown[])
          .map(strList)
          .filter((t) => t.length > 1)
      : undefined;
    entities.push(
      withInferredSemantics({
        id: str(e.id) ?? slugId(name),
        name,
        table: str(e.table),
        description: str(e.description),
        fields,
        evidence: strList(e.evidence),
        source: "agent",
        uniqueTogether: uniqueTogether?.length ? uniqueTogether : undefined,
      }),
    );
  }
  return { entities, skipped };
}

function parseRuleSpec(raw: Record<string, unknown>): RuleSpec | null {
  const kind = str(raw.kind);
  switch (kind) {
    case "implies": {
      const ifPart = obj(raw.if);
      const thenPart = obj(raw.then);
      const ifField = ifPart ? str(ifPart.field) : undefined;
      const thenField = thenPart ? str(thenPart.field) : undefined;
      if (!ifPart || !thenPart || !ifField || !thenField) return null;
      return {
        kind,
        if: {
          field: ifField,
          in: Array.isArray(ifPart.in) ? ifPart.in : undefined,
          isNull: bool(ifPart.isNull ?? ifPart.is_null),
        },
        then: {
          field: thenField,
          isNull: bool(thenPart.isNull ?? thenPart.is_null),
          in: Array.isArray(thenPart.in) ? thenPart.in : undefined,
          equals: thenPart.equals,
        },
      };
    }
    case "compare": {
      const field = str(raw.field);
      const other = str(raw.other);
      const op = str(raw.op);
      if (!field || !other || !op || !["<", "<=", ">", ">=", "=="].includes(op))
        return null;
      return { kind, field, other, op: op as "<" | "<=" | ">" | ">=" | "==" };
    }
    case "unique_together": {
      const fields = strList(raw.fields);
      return fields.length > 1 ? { kind, fields } : null;
    }
    case "range": {
      const field = str(raw.field);
      if (!field) return null;
      return { kind, field, min: num(raw.min), max: num(raw.max) };
    }
    case "pattern": {
      const field = str(raw.field);
      const pattern = str(raw.pattern);
      return field && pattern ? { kind, field, pattern } : null;
    }
    default:
      return null;
  }
}

function parseRules(
  raw: unknown,
  project: SynthProject,
): { rules: Rule[]; invalid: string[] } {
  const rules: Rule[] = [];
  const invalid: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = obj(entry);
    const entityRef = e ? str(e.entity) : undefined;
    const entity = entityRef ? findEntity(project.model, entityRef) : undefined;
    if (!e || !entity) {
      invalid.push(`unknown entity ${entityRef ?? "(missing)"}`);
      continue;
    }
    const spec = parseRuleSpec(obj(e.spec) ?? e);
    if (!spec) {
      invalid.push(
        `${entity.id}: unreadable spec (${str(e.kind) ?? str(obj(e.spec)?.kind) ?? "no kind"})`,
      );
      continue;
    }
    const fieldNames = new Set(entity.fields.map((f) => f.name));
    const referenced =
      spec.kind === "implies"
        ? [spec.if.field, spec.then.field]
        : spec.kind === "compare"
          ? [spec.field, spec.other]
          : spec.kind === "unique_together"
            ? spec.fields
            : [spec.field];
    const missing = referenced.filter((f) => !fieldNames.has(f));
    if (missing.length) {
      invalid.push(`${entity.id}: unknown field(s) ${missing.join(", ")}`);
      continue;
    }
    const description = str(e.description) ?? `${entity.id}: ${spec.kind}`;
    rules.push({
      id: str(e.id) ?? `${entity.id}-${slugId(description).slice(0, 40)}`,
      entity: entity.id,
      description,
      spec,
      evidence: strList(e.evidence),
    });
  }
  return { rules, invalid };
}

function parseFlows(
  raw: unknown,
  project: SynthProject,
): { flows: DataFlow[]; invalid: string[] } {
  const flows: DataFlow[] = [];
  const invalid: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = obj(entry);
    const name = e ? str(e.name) : undefined;
    const from = e ? (str(e.from) ?? str(e.source)) : undefined;
    const to = e ? (str(e.to) ?? str(e.target)) : undefined;
    if (!e || !name || !from || !to) {
      invalid.push("flow needs name, from and to");
      continue;
    }
    const entities = strList(e.entities)
      .map((id) => findEntity(project.model, id)?.id)
      .filter((id): id is string => Boolean(id));
    flows.push({
      id: str(e.id) ?? slugId(name),
      name,
      from,
      to,
      via: str(e.via),
      entities,
      description: str(e.description),
      evidence: strList(e.evidence),
    });
  }
  return { flows, invalid };
}

const MAX_CATEGORIES = 50;
const PERSONAL_LABEL = /@|^\+?\d[\d\s-]{6,}$|^\d{3}-\d{2}-\d{4}$/;

function parseDistribution(raw: unknown): {
  distribution?: Distribution;
  error?: string;
} {
  const d = obj(raw);
  if (!d) return { error: "missing_distribution" };
  switch (str(d.kind)) {
    case "categorical": {
      const weights = obj(d.weights);
      if (!weights) return { error: "missing_weights" };
      const entries = Object.entries(weights).filter(
        ([, v]) => typeof v === "number" && v >= 0,
      );
      if (entries.length === 0) return { error: "empty_weights" };
      if (entries.length > MAX_CATEGORIES)
        return { error: `too_many_categories:${entries.length}` };
      if (entries.some(([k]) => PERSONAL_LABEL.test(k)))
        return { error: "labels_look_personal" };
      return {
        distribution: {
          kind: "categorical",
          weights: Object.fromEntries(entries) as Record<string, number>,
        },
      };
    }
    case "normal": {
      const mean = num(d.mean);
      const stddev = num(d.stddev ?? d.std);
      if (mean === undefined || stddev === undefined || stddev < 0)
        return { error: "normal_needs_mean_and_stddev" };
      return { distribution: { kind: "normal", mean, stddev } };
    }
    case "uniform": {
      const min = num(d.min);
      const max = num(d.max);
      if (min === undefined || max === undefined || max < min)
        return { error: "uniform_needs_min_le_max" };
      return { distribution: { kind: "uniform", min, max } };
    }
    case "null_rate": {
      const rate = num(d.rate);
      if (rate === undefined || rate < 0 || rate > 1)
        return { error: "rate_must_be_0_to_1" };
      return { distribution: { kind: "null_rate", rate } };
    }
    default:
      return { error: "unknown_kind" };
  }
}

function parseOptions(raw: unknown): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = obj(entry);
    const label = e ? str(e.label) : undefined;
    if (!e || !label) continue;
    options.push({
      id: str(e.id) ?? slugId(label),
      label,
      description: str(e.description),
      recommended: e.recommended === true,
    });
  }
  return options;
}

function parseScenarios(
  raw: unknown,
  project: SynthProject,
): { scenarios: Scenario[]; invalid: string[] } {
  const scenarios: Scenario[] = [];
  const invalid: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = obj(entry);
    const name = e ? str(e.name) : undefined;
    if (!e || !name) {
      invalid.push("scenario without a name");
      continue;
    }
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj(e.counts) ?? {})) {
      const entity = findEntity(project.model, k);
      const n = num(v);
      if (entity && n !== undefined)
        counts[entity.id] = Math.max(
          0,
          Math.min(MAX_ROWS_PER_ENTITY, Math.floor(n)),
        );
      else invalid.push(`${name}: count for unknown entity ${k}`);
    }
    const overrides: ScenarioOverride[] = [];
    for (const o of Array.isArray(e.overrides) ? e.overrides : []) {
      const ov = obj(o);
      const entity = ov
        ? findEntity(project.model, str(ov.entity) ?? "")
        : undefined;
      const field = ov ? str(ov.field) : undefined;
      if (
        !ov ||
        !entity ||
        !field ||
        !entity.fields.some((f) => f.name === field)
      ) {
        invalid.push(`${name}: override on unknown entity/field`);
        continue;
      }
      const weightsObj = obj(ov.weights);
      overrides.push({
        entity: entity.id,
        field,
        values: Array.isArray(ov.values) ? ov.values : undefined,
        weights: weightsObj
          ? (Object.fromEntries(
              Object.entries(weightsObj).filter(
                ([, v]) => typeof v === "number",
              ),
            ) as Record<string, number>)
          : undefined,
        share: num(ov.share),
        nullRate: num(ov.null_rate ?? ov.nullRate),
      });
    }
    const parentDistribution = str(
      e.parent_distribution ?? e.parentDistribution,
    );
    scenarios.push({
      id: str(e.id) ?? slugId(name),
      name,
      description: str(e.description),
      counts,
      defaultCount: num(e.default_count ?? e.defaultCount),
      edgeCases: bool(e.edge_cases ?? e.edgeCases),
      nullRate: num(e.null_rate ?? e.nullRate),
      parentDistribution:
        parentDistribution === "skewed" || parentDistribution === "uniform"
          ? parentDistribution
          : undefined,
      overrides: overrides.length ? overrides : undefined,
    });
  }
  return { scenarios, invalid };
}

/* ── Generation (shared by the agent command and the Generate button) ─── */

export interface GenerateRequest {
  scenarioId?: string;
  seed?: number | string;
  formats?: ExportFormat[];
  counts?: Record<string, number>;
  edgeCases?: boolean;
  /** Resize the scenario to this many rows overall, keeping its ratios. */
  totalRows?: number;
  /** Write into the workspace when a runtime is attached (default true). */
  write?: boolean;
}

export const DEFAULT_FORMATS: ExportFormat[] = ["json", "csv", "sql_postgres"];

export function allScenarios(project: SynthProject): Scenario[] {
  const builtin = builtinScenarios(project.model);
  const custom = project.scenarios.filter(
    (s) => !builtin.some((b) => b.id === s.id),
  );
  return [...builtin, ...custom];
}

export function resolveScenario(
  project: SynthProject,
  request: GenerateRequest,
): Scenario | null {
  const id = request.scenarioId ?? "smoke";
  const base =
    project.scenarios.find((s) => s.id === id) ??
    builtinScenarios(project.model).find((s) => s.id === id) ??
    null;
  if (!base) return null;
  const counts = { ...base.counts };
  for (const [k, v] of Object.entries(request.counts ?? {})) {
    const entity = findEntity(project.model, k);
    if (entity && Number.isFinite(v))
      counts[entity.id] = Math.max(0, Math.floor(v));
  }
  const resolved = {
    ...base,
    counts,
    edgeCases: request.edgeCases ?? base.edgeCases,
  };
  return request.totalRows && request.totalRows > 0
    ? scaleToTotal(resolved, project.model, request.totalRows)
    : clampScenario(resolved, project.model);
}

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

export type GenerateOutcome =
  | { ok: true; run: SynthRun }
  | { ok: false; reason: string; detail?: unknown };

/**
 * Generate, validate, export and (when possible) write a dataset for a
 * project. Records the run in the store and caches the full data for this
 * tab. Never throws.
 */
export async function runGeneration(
  projectId: string,
  request: GenerateRequest,
  options: {
    runInWorkspace?: RunInWorkspace;
    triggeredBy: SynthRun["triggeredBy"];
    now?: () => number;
  },
): Promise<GenerateOutcome> {
  const store = useSynthStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return { ok: false, reason: "no_project" };
  const problems = modelProblems(project.model);
  if (problems.length)
    return { ok: false, reason: "model_invalid", detail: problems };
  const scenario = resolveScenario(project, request);
  if (!scenario) {
    return {
      ok: false,
      reason: "unknown_scenario",
      detail: allScenarios(project).map((s) => s.id),
    };
  }
  const formats = (
    request.formats?.length ? request.formats : DEFAULT_FORMATS
  ).filter((f) => (EXPORT_FORMATS as readonly string[]).includes(f));
  const seed = request.seed ?? randomSeed();
  const startedAt = new Date((options.now ?? Date.now)()).toISOString();
  store.setStatus(projectId, "generating");
  store.appendLog(projectId, {
    id: newSynthId("log"),
    level: "info",
    text: `Generating ${scenario.name} (${totalRows(scenario, project.model).toLocaleString()} rows, seed ${seed})`,
    at: startedAt,
  });
  try {
    const dataset = generateDataset(project.model, scenario, {
      seed,
      now: new Date((options.now ?? Date.now)()),
    });
    const validation = validateDataset(project.model, dataset);
    const files = exportDataset(project.model, dataset, formats);
    files.push({
      path: "validation-report.json",
      content: `${JSON.stringify(validation, null, 2)}\n`,
      mimeType: "application/json",
    });
    files.push({
      path: "privacy-report.md",
      content: privacyReportMarkdown(privacyReport(project.model)),
      mimeType: "text/markdown",
    });
    const runId = newSynthId("run");
    let workspaceDir: string | undefined;
    let writtenFiles: string[] = [];
    let writeError: string | undefined;
    if (options.runInWorkspace && request.write !== false) {
      const bytes = totalBytes(files);
      if (bytes > MAX_WORKSPACE_BYTES) {
        writeError = `dataset is ${(bytes / 1024 / 1024).toFixed(1)} MB; above the ${MAX_WORKSPACE_BYTES / 1024 / 1024} MB workspace limit, download it from the studio instead`;
      } else {
        const written = await writeRunToWorkspace(
          options.runInWorkspace,
          runId,
          files,
        );
        workspaceDir = written.dir;
        writtenFiles = written.written;
        if (!written.ok) writeError = written.error ?? "write failed";
      }
    }
    const summary = datasetSummary(dataset);
    const preview: SynthRun["preview"] = {};
    for (const id of dataset.order)
      preview[id] = (dataset.tables[id] ?? []).slice(0, PREVIEW_ROWS);
    const run: SynthRun = {
      id: runId,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      seed: dataset.seed,
      modelHash: dataset.modelHash,
      formats,
      startedAt,
      finishedAt: new Date((options.now ?? Date.now)()).toISOString(),
      rowsTotal: summary.total,
      rowsPerEntity: summary.perEntity,
      edgeRowsPerEntity: Object.fromEntries(
        Object.entries(dataset.edgeRows).map(([k, v]) => [k, v.length]),
      ),
      validation: {
        ok: validation.ok,
        checksTotal: validation.checksTotal,
        checksPassed: validation.checksPassed,
        failed: validation.checks
          .filter((c) => !c.passed)
          .slice(0, 40)
          .map((c) => ({
            id: c.id,
            label: c.label,
            entity: c.entity,
            failures: c.failures,
            samples: c.samples,
          })),
      },
      warnings: dataset.warnings,
      workspaceDir: writtenFiles.length ? workspaceDir : undefined,
      writtenFiles,
      writeError,
      preview,
      triggeredBy: options.triggeredBy,
    };
    cacheRun(runId, { dataset, files, validation });
    store.addRun(projectId, run);
    store.appendLog(projectId, {
      id: newSynthId("log"),
      level: validation.ok ? "success" : "warn",
      text: validation.ok
        ? `${summary.total.toLocaleString()} rows generated; ${validation.checksPassed}/${validation.checksTotal} checks passed${writtenFiles.length ? ` · written to ${workspaceDir}` : ""}`
        : `${summary.total.toLocaleString()} rows generated; ${validation.checksTotal - validation.checksPassed} of ${validation.checksTotal} checks failed`,
      at: run.finishedAt,
    });
    store.setStatus(projectId, "ready");
    return { ok: true, run };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.appendLog(projectId, {
      id: newSynthId("log"),
      level: "error",
      text: `Generation failed: ${message}`,
      at: new Date().toISOString(),
    });
    store.setStatus(projectId, "ready");
    return { ok: false, reason: "generation_failed", detail: message };
  }
}

/* ── Completion rules ──────────────────────────────────────────────────── */

export function runIsVerified(run: SynthRun): boolean {
  const v = run.verification;
  if (!v) return false;
  if ((v.rowsLoaded ?? 0) > 0) return true;
  return (v.testsTotal ?? 0) > 0 && v.testsPassing === v.testsTotal;
}

/** What still blocks `complete`, in the words the receipt uses. */
export function completionBlockers(project: SynthProject): string[] {
  const missing: string[] = [];
  if (project.model.entities.length === 0) missing.push("no_entities");
  const valid = project.runs.filter((r) => r.validation.ok);
  if (valid.length === 0) missing.push("no_valid_run");
  if (!valid.some(runIsVerified)) missing.push("no_verified_run");
  if (project.questions.some((q) => q.status === "open"))
    missing.push("open_questions");
  return missing;
}

/**
 * Auto-continue after a card is answered (see modernization-control.ts for
 * the why). One nudge per receipt, never while something waits on the user.
 */
export const AUTO_CONTINUE_WINDOW_MS = 120_000;
export const AUTO_CONTINUE_MESSAGE =
  "Your input arrived in the receipt above (the card was answered). Call describe to re-read the project state, then continue with the next step now.";

export function shouldAutoContinue({
  agentIdle,
  lastReceiptAt,
  nudgedForReceiptAt,
  now,
  project,
}: {
  agentIdle: boolean;
  lastReceiptAt: number | null;
  nudgedForReceiptAt: number | null;
  now: number;
  project: Pick<SynthProject, "status" | "questions">;
}): boolean {
  if (!agentIdle || lastReceiptAt === null) return false;
  if (nudgedForReceiptAt === lastReceiptAt) return false;
  if (now - lastReceiptAt > AUTO_CONTINUE_WINDOW_MS) return false;
  if (project.status === "done") return false;
  if (project.questions.some((q) => q.status === "open")) return false;
  return true;
}

/**
 * Keep the run moving when the agent stops mid-work. Gemini often ends a
 * turn with "now I'll import the schema" and nothing else; with no card
 * open and the dataset not yet complete, nudge once per idle period and
 * give up after a few nudges in a row that produced no progress.
 */
export const MID_PLAN_MAX_NUDGES = 3;
export const MID_PLAN_CONTINUE_MESSAGE =
  "You ended your turn but the dataset is not complete and nothing is waiting on me. Call describe if you need the state, then continue with the next step (model, rules, scenarios, generate, verify, complete). Keep going until a card needs me or complete succeeds.";

export function shouldContinueMidPlan({
  agentIdle,
  idleAt,
  nudgedForIdleAt,
  nudgesWithoutProgress,
  lastAgentText,
  project,
}: {
  agentIdle: boolean;
  idleAt: number | null;
  nudgedForIdleAt: number | null;
  nudgesWithoutProgress: number;
  lastAgentText: string | null;
  project: SynthProject;
}): boolean {
  if (!agentIdle || idleAt === null || nudgedForIdleAt === idleAt) return false;
  if (nudgesWithoutProgress >= MID_PLAN_MAX_NUDGES) return false;
  if (project.status === "done" || project.status === "failed") return false;
  if (completionBlockers(project).length === 0) return false;
  if (project.questions.some((q) => q.status === "open")) return false;
  // A question to the user in plain text is a legitimate stop.
  if (lastAgentText?.trim().endsWith("?")) return false;
  return true;
}

/**
 * Catch-up for commands the studio never saw: a synth_control ActionEvent
 * in the loaded history whose id is not in the project's handled list was
 * issued while the tab was away. Idempotent commands are dispatched now
 * (they post their receipts as usual); `generate` is answered with a
 * rejection instead, because re-running it would create a second dataset
 * the agent never asked for, and `log` lines are simply marked.
 */
export async function replayMissedSynthCommands(
  events: readonly OpenHandsEvent[],
  context: Omit<DispatchContext, "actionId">,
): Promise<string[]> {
  const project = findProjectForConversation(context.conversationId);
  if (!project) return [];
  const store = useSynthStudioStore.getState();
  // A project saved before handled ids were tracked: everything up to the
  // studio's last receipt was seen by the studio that posted it.
  if (project.handledActionIds === undefined) {
    let lastReceipt = -1;
    events.forEach((event, i) => {
      if (isSynthReceiptMessage(event)) lastReceipt = i;
    });
    events.slice(0, lastReceipt + 1).forEach((event) => {
      if (isSynthControlActionEvent(event)) {
        store.markActionHandled(project.id, String(event.id));
      }
    });
  }
  const handled = new Set(
    useSynthStudioStore.getState().projects[project.id]?.handledActionIds ?? [],
  );
  const replayed: string[] = [];
  for (const event of events) {
    if (!isSynthControlActionEvent(event)) continue;
    const id = String(event.id);
    if (handled.has(id)) continue;
    const command = event.action.command;
    if (command === "log") {
      store.markActionHandled(project.id, id);
      continue;
    }
    if (command === "generate") {
      if (store.markActionHandled(project.id, id)) {
        postReceipt(context, {
          status: "rejected",
          reason: "studio_was_away",
          guidance:
            "The studio was not open when this generate call arrived, so no dataset was produced. Call describe, then generate again.",
        });
        replayed.push(id);
      }
      continue;
    }
    // Sequential: a replayed record_model must land before the replayed
    // report_verification that depends on it.
    await handleSynthControlAction(event.action, { ...context, actionId: id });
    replayed.push(id);
  }
  return replayed;
}

function isSynthReceiptMessage(event: OpenHandsEvent): boolean {
  if (!isMessageEvent(event) || event.source !== "user") return false;
  const content = (event as { llm_message?: { content?: unknown } }).llm_message
    ?.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) =>
      part &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text
        .trimStart()
        .startsWith(SYNTH_RESULT_PREFIX),
  );
}

/* ── describe ──────────────────────────────────────────────────────────── */

function describeProject(project: SynthProject, schemaFiles: string[]) {
  const { model } = project;
  const relations = relationsOf(model);
  return {
    project: {
      id: project.id,
      name: project.name,
      source: project.source,
      status: project.status,
    },
    resumed: model.entities.length > 0 || project.runs.length > 0,
    schema_files_found: schemaFiles,
    model: {
      entities: model.entities.map((e) => ({
        id: e.id,
        name: e.name,
        table: e.table,
        source: e.source,
        fields: e.fields.map((f) =>
          [
            f.name,
            f.type,
            f.semantic,
            f.primaryKey
              ? "pk"
              : f.references
                ? `fk→${f.references.entity}.${f.references.field}`
                : null,
            f.nullable ? "nullable" : null,
            f.unique ? "unique" : null,
            f.enumValues ? `enum(${f.enumValues.length})` : null,
            f.pii ? `pii=${f.pii}` : null,
            f.treatment ? `treatment=${f.treatment}` : null,
          ]
            .filter(Boolean)
            .join(":"),
        ),
        // The user's own words about columns: authoritative over names.
        column_context: e.fields
          .filter((f) => f.context || f.examples?.length)
          .map((f) => ({
            field: f.name,
            context: f.context,
            examples: f.examples,
          })),
      })),
      relations: relations.map(
        (r) =>
          `${r.fromEntity}.${r.fromField} → ${r.toEntity}.${r.toField}${r.oneToOne ? " (1:1)" : ""}`,
      ),
      rules: model.rules.map((r) => ({
        id: r.id,
        entity: r.entity,
        description: r.description,
      })),
      flows: model.flows.map((f) => ({
        id: f.id,
        name: f.name,
        from: f.from,
        to: f.to,
        entities: f.entities,
      })),
      problems: modelProblems(model),
      privacy: (() => {
        const report = privacyReport(model);
        return {
          strategies: report.strategies,
          // High-risk identifiers nobody chose a treatment for yet: ask the
          // user (ask_choice) whether to keep synthetic values, mask or
          // redact them, then record_model with treatment.
          decisions_pending: report.undecided.map(
            (u) => `${u.entity}.${u.field} (${u.semantic})`,
          ),
        };
      })(),
      profiled_fields: model.entities.flatMap((e) =>
        e.fields.filter((f) => f.distribution).map((f) => `${e.id}.${f.name}`),
      ),
    },
    scenarios: allScenarios(project).map((s) => ({
      id: s.id,
      name: s.name,
      rows: totalRows(s, model),
      edge_cases: Boolean(s.edgeCases),
      custom: project.scenarios.some((c) => c.id === s.id),
    })),
    runs: project.runs.map((r) => ({
      run_id: r.id,
      scenario: r.scenarioId,
      seed: r.seed,
      rows: r.rowsTotal,
      valid: r.validation.ok,
      checks: `${r.validation.checksPassed}/${r.validation.checksTotal}`,
      dir: r.workspaceDir,
      verified: runIsVerified(r),
    })),
    open_questions: project.questions
      .filter((q) => q.status === "open")
      .map((q) => q.id),
    answers: project.questions
      .filter((q) => q.status === "answered")
      .map((q) => ({
        question_id: q.id,
        title: q.title,
        selected: q.selected,
        other: q.other,
      })),
    report: project.report,
    formats: EXPORT_FORMATS,
    limits: {
      max_rows_per_run: MAX_ROWS_PER_RUN,
      max_rows_per_entity: MAX_ROWS_PER_ENTITY,
    },
    output_dir: SYNTH_OUTPUT_DIR,
    completion_blockers: completionBlockers(project),
    commands: COMMAND_SHAPES,
  };
}

/* ── Dispatcher ────────────────────────────────────────────────────────── */

export async function handleSynthControlAction(
  action: SynthControlAction,
  context: DispatchContext,
): Promise<void> {
  const store = useSynthStudioStore.getState();
  const payload = payloadOf(action);

  if (!isCommand(action.command)) {
    postReceipt(context, {
      status: "rejected",
      reason: "unknown_command",
      valid_commands: SYNTH_CONTROL_COMMANDS,
    });
    return;
  }

  const project = findProjectForConversation(context.conversationId);
  if (!project) {
    postReceipt(context, {
      status: "rejected",
      reason: "no_project",
      guidance:
        "This conversation is not attached to a Neo Synth project. In a Neo ME migration, generate Synth data with modernization_control describe {synth_data: {schema_path}} instead. Otherwise ask the user to open the studio from the Synth page.",
    });
    return;
  }
  const projectId = project.id;
  if (
    context.actionId &&
    !store.markActionHandled(projectId, context.actionId)
  ) {
    // Already dispatched (reconnect replay or the mount-time catch-up).
    return;
  }
  const now = new Date((context.now ?? Date.now)()).toISOString();
  const log = (level: "info" | "warn" | "error" | "success", text: string) =>
    store.appendLog(projectId, {
      id: newSynthId("log"),
      level,
      text: text.slice(0, 400),
      at: now,
    });

  switch (action.command) {
    case "describe": {
      const schemaFiles = context.runInWorkspace
        ? await findSchemaFiles(context.runInWorkspace)
        : [];
      postReceipt(context, {
        status: "ok",
        ...describeProject(project, schemaFiles),
      });
      return;
    }

    case "import_schema": {
      const paths = [
        ...strList(payload.paths),
        ...(str(payload.path) ? [str(payload.path)!] : []),
      ];
      if (paths.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_paths",
          shape: COMMAND_SHAPES.import_schema,
        });
        return;
      }
      if (!context.runInWorkspace) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_runtime",
          guidance:
            "The studio cannot read the workspace right now. Read the file yourself and call record_model.",
        });
        return;
      }
      const imported: Record<string, unknown>[] = [];
      const allEntities: Entity[] = [];
      for (const path of paths.slice(0, 20)) {
        const content = await readWorkspaceFile(context.runInWorkspace, path);
        if (content === null) {
          imported.push({ path, error: "not_found_or_unreadable" });
          continue;
        }
        const result = parseSchemaFile(path, content);
        allEntities.push(...result.entities);
        imported.push({
          path,
          format: result.format,
          entities: result.entities.map((e) => e.id),
          warnings: result.warnings.length
            ? result.warnings.slice(0, 10)
            : undefined,
        });
      }
      if (allEntities.length) {
        store.upsertEntities(projectId, allEntities);
        if (project.status === "intake") store.setStatus(projectId, "modeling");
        log(
          "success",
          `Imported ${allEntities.length} entities from ${paths.length} file(s)`,
        );
      }
      const after = useSynthStudioStore.getState().projects[projectId];
      postReceipt(context, {
        status: allEntities.length ? "ok" : "rejected",
        reason: allEntities.length ? undefined : "nothing_imported",
        imported,
        entities_total: after?.model.entities.length ?? 0,
        model_problems: after ? modelProblems(after.model) : [],
        guidance:
          "Parsers read structure only. Now read the code for what the schema cannot say: business rules (record_rules), data flows (record_flows), and the meaning of ambiguous fields (record_model with semantic).",
      });
      return;
    }

    case "record_model": {
      const scan = scanForSecrets(payload);
      if (!scan.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "looks_like_credential",
          detail: scan.reason,
          guidance:
            "Never record secrets or real values. The model holds names, types and meaning only.",
        });
        return;
      }
      const { entities, skipped } = parseEntities(payload.entities);
      if (entities.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_entities",
          shape: COMMAND_SHAPES.record_model,
          skipped,
        });
        return;
      }
      store.upsertEntities(projectId, entities, {
        replace: payload.replace === true,
      });
      if (project.status === "intake" || project.status === "discovering")
        store.setStatus(projectId, "modeling");
      log("info", `Recorded ${entities.map((e) => e.name).join(", ")}`);
      const after = useSynthStudioStore.getState().projects[projectId];
      postReceipt(context, {
        status: "ok",
        recorded: entities.map((e) => e.id),
        skipped: skipped.length ? skipped : undefined,
        entities_total: after?.model.entities.length ?? entities.length,
        model_problems: after ? modelProblems(after.model) : [],
      });
      return;
    }

    case "record_rules": {
      const { rules, invalid } = parseRules(payload.rules, project);
      if (rules.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_rules",
          shape: COMMAND_SHAPES.record_rules,
          invalid,
        });
        return;
      }
      store.upsertRules(projectId, rules);
      log("info", `Recorded ${rules.length} rule(s)`);
      postReceipt(context, {
        status: "ok",
        recorded: rules.map((r) => r.id),
        invalid: invalid.length ? invalid : undefined,
      });
      return;
    }

    case "record_flows": {
      const { flows, invalid } = parseFlows(payload.flows, project);
      if (flows.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_flows",
          shape: COMMAND_SHAPES.record_flows,
          invalid,
        });
        return;
      }
      store.upsertFlows(projectId, flows);
      log("info", `Recorded ${flows.length} data flow(s)`);
      postReceipt(context, {
        status: "ok",
        recorded: flows.map((f) => f.id),
        invalid: invalid.length ? invalid : undefined,
      });
      return;
    }

    case "record_profile": {
      const entity = findEntity(project.model, str(payload.entity) ?? "");
      const fieldName = str(payload.field);
      const field = entity?.fields.find((f) => f.name === fieldName);
      if (!entity || !field) {
        postReceipt(context, {
          status: "rejected",
          reason: entity ? "unknown_field" : "unknown_entity",
          known: entity
            ? entity.fields.map((f) => f.name)
            : project.model.entities.map((e) => e.id),
        });
        return;
      }
      const scan = scanForSecrets(payload);
      if (!scan.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "looks_like_credential",
          detail: scan.reason,
        });
        return;
      }
      const { distribution, error } = parseDistribution(payload.distribution);
      if (!distribution) {
        postReceipt(context, {
          status: "rejected",
          reason: error,
          shape: COMMAND_SHAPES.record_profile,
        });
        return;
      }
      store.setFieldDistribution(
        projectId,
        entity.id,
        field.name,
        distribution,
      );
      log("info", `Profiled ${entity.id}.${field.name} (${distribution.kind})`);
      postReceipt(context, {
        status: "ok",
        entity: entity.id,
        field: field.name,
        kind: distribution.kind,
      });
      return;
    }

    case "ask_choice": {
      const title = str(payload.title);
      const options = parseOptions(payload.options);
      const kind = str(payload.kind) === "multi" ? "multi" : "single";
      if (!title || options.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: !title ? "missing_title" : "no_options",
          shape: COMMAND_SHAPES.ask_choice,
        });
        return;
      }
      const questionId = str(payload.question_id) ?? slugId(title);
      const existing = project.questions.find((q) => q.id === questionId);
      if (existing?.status === "answered") {
        // Re-asked (or replayed) after the user already chose: hand the
        // answer back instead of reopening the card.
        postReceipt(context, {
          status: "answered",
          question_id: existing.id,
          selected: existing.selected,
          other: existing.other,
        });
        return;
      }
      const question: ChoiceQuestion = {
        id: questionId,
        title,
        prompt: str(payload.prompt),
        kind,
        options,
        allowOther: payload.allow_other !== false,
        status: "open",
        selected: [],
        at: now,
      };
      store.askQuestion(projectId, question);
      if (project.status !== "done") store.setStatus(projectId, "interviewing");
      postReceipt(context, {
        status: "pending_user",
        question_id: question.id,
        guidance:
          "The card is on screen. Tell the user in one short sentence to pick on the right, then stop and wait for the answered receipt.",
      });
      return;
    }

    case "set_scenarios": {
      const { scenarios, invalid } = parseScenarios(payload.scenarios, project);
      if (scenarios.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_scenarios",
          shape: COMMAND_SHAPES.set_scenarios,
          invalid,
        });
        return;
      }
      store.upsertScenarios(projectId, scenarios);
      if (project.status === "interviewing" || project.status === "modeling")
        store.setStatus(projectId, "ready");
      log("info", `Scenarios: ${scenarios.map((s) => s.name).join(", ")}`);
      postReceipt(context, {
        status: "ok",
        scenarios: scenarios.map((s) => ({
          id: s.id,
          rows: totalRows(clampScenario(s, project.model), project.model),
        })),
        invalid: invalid.length ? invalid : undefined,
      });
      return;
    }

    case "generate": {
      const formats = strList(payload.formats).filter((f): f is ExportFormat =>
        (EXPORT_FORMATS as readonly string[]).includes(f),
      );
      const countsRaw = obj(payload.counts) ?? {};
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(countsRaw))
        if (num(v) !== undefined) counts[k] = num(v)!;
      const outcome = await runGeneration(
        projectId,
        {
          scenarioId: str(payload.scenario_id ?? payload.scenario),
          seed: num(payload.seed) ?? str(payload.seed),
          formats,
          counts,
          edgeCases: bool(payload.edge_cases),
          totalRows: num(payload.total_rows),
          write: payload.write !== false,
        },
        {
          runInWorkspace: context.runInWorkspace,
          triggeredBy: "agent",
          now: context.now,
        },
      );
      if (!outcome.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: outcome.reason,
          detail: outcome.detail,
          guidance:
            outcome.reason === "model_invalid"
              ? "Fix the model first (record_model / remove the broken reference), then generate again."
              : outcome.reason === "unknown_scenario"
                ? "Use one of the listed scenario ids or define one with set_scenarios."
                : undefined,
        });
        return;
      }
      const { run } = outcome;
      postReceipt(context, {
        status: "ok",
        run_id: run.id,
        scenario: run.scenarioId,
        seed: run.seed,
        rows_total: run.rowsTotal,
        rows_per_entity: run.rowsPerEntity,
        validation: {
          ok: run.validation.ok,
          checks_passed: run.validation.checksPassed,
          checks_total: run.validation.checksTotal,
          failed: run.validation.failed.slice(0, 12),
        },
        warnings: run.warnings.slice(0, 12),
        dir: run.workspaceDir,
        files: run.writtenFiles.slice(0, 40),
        write_error: run.writeError,
        guidance: run.validation.ok
          ? `Now USE the data: load ${run.workspaceDir ?? "the files"} into the application's database or test fixtures (seed.*.sql, data/*.json, prisma/seed.ts), run the app's own tests or a smoke query against it, and report the real numbers with report_verification.`
          : "Validation failed: read validation.failed, fix the model or rules (a contradicting rule, a one-to-one with too few parents), and generate again. Do not report verification on an invalid run.",
      });
      return;
    }

    case "report_verification": {
      const runId = str(payload.run_id);
      const run = runId ? project.runs.find((r) => r.id === runId) : undefined;
      if (!run) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_run",
          known_runs: project.runs.map((r) => r.id),
        });
        return;
      }
      if (!run.validation.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "run_not_valid",
          guidance:
            "Generate a run that passes validation before verifying it.",
        });
        return;
      }
      const testsTotal = num(payload.tests_total);
      const testsPassing = num(payload.tests_passing);
      const rowsLoaded = num(payload.rows_loaded);
      if (
        testsTotal !== undefined &&
        testsPassing !== undefined &&
        testsPassing > testsTotal
      ) {
        postReceipt(context, {
          status: "rejected",
          reason: "tests_passing_exceeds_total",
        });
        return;
      }
      if ((rowsLoaded ?? 0) <= 0 && (testsTotal ?? 0) <= 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "nothing_verified",
          guidance:
            "Report rows_loaded > 0 (after loading the data) and/or tests_total with tests_passing from a real test run against it.",
        });
        return;
      }
      const verification: RunVerification = {
        loadedInto: str(payload.loaded_into),
        rowsLoaded,
        testsTotal,
        testsPassing,
        notes: str(payload.notes),
        at: now,
      };
      store.setRunVerification(projectId, run.id, verification);
      const verified = runIsVerified({ ...run, verification });
      if (project.status !== "done") {
        store.setStatus(projectId, verified ? "verifying" : "ready");
      }
      log(
        verified ? "success" : "warn",
        verified
          ? `Run ${run.id} verified${verification.loadedInto ? ` in ${verification.loadedInto}` : ""}${rowsLoaded ? ` · ${rowsLoaded.toLocaleString()} rows loaded` : ""}${testsTotal ? ` · tests ${testsPassing ?? 0}/${testsTotal}` : ""}`
          : `Run ${run.id}: tests ${testsPassing ?? 0}/${testsTotal ?? 0} failing`,
      );
      postReceipt(context, {
        status: "ok",
        run_id: run.id,
        verified,
        guidance: verified
          ? undefined
          : "Tests are failing against the data. Fix the cause (model, rule or the app) and report again.",
      });
      return;
    }

    case "log": {
      const text = str(payload.text);
      if (!text) {
        postReceipt(context, { status: "rejected", reason: "missing_text" });
        return;
      }
      const level = str(payload.level);
      log(
        level === "warn" || level === "error" || level === "success"
          ? level
          : "info",
        text,
      );
      // Fire-and-forget: no receipt, or the agent spends a call per line.
      return;
    }

    case "complete": {
      const summary = str(payload.summary);
      if (!summary) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_summary",
          shape: COMMAND_SHAPES.complete,
        });
        return;
      }
      const missing = completionBlockers(project);
      if (missing.length) {
        postReceipt(context, {
          status: "rejected",
          reason: "verification_required",
          missing,
          guidance:
            "A synthetic dataset is complete only when a run passed validation and was proven usable (report_verification with rows_loaded > 0 or a green test run), and no card is waiting on the user.",
        });
        return;
      }
      store.setReport(projectId, {
        summary,
        artifacts: strList(payload.artifacts),
        at: now,
      });
      log("success", "Synthetic data ready");
      postReceipt(context, { status: "ok", completed: true });
      return;
    }

    default: {
      const never: never = action.command;
      postReceipt(context, {
        status: "rejected",
        reason: "unhandled",
        command: never,
      });
    }
  }
}
