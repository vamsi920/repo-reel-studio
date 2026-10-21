/**
 * Neo Synth: synthetic data engine. Pure functions from a data model plus a
 * seed to reproducible, valid, realistic datasets in several formats.
 */
export * from "./model";
export { createRng, hashString, uuidFrom, type Rng } from "./rng";
export {
  inferSemantic,
  normalizeType,
  piiClassOf,
  withInferredSemantics,
} from "./semantics";
export {
  generateDataset,
  datasetSummary,
  type GenerateOptions,
} from "./generate";
export {
  validateDataset,
  checkRule,
  type ValidationCheck,
  type ValidationReport,
} from "./validate";
export {
  EXPORT_FORMATS,
  FORMAT_LABELS,
  exportDataset,
  buildManifest,
  toCsv,
  toSql,
  toPrismaSeed,
  toPytestConftest,
  totalBytes,
  type ExportFormat,
  type ExportedFile,
  type Manifest,
} from "./exporters";
export {
  privacyReport,
  privacyReportMarkdown,
  maskRows,
  type PrivacyReport,
  type PiiFinding,
} from "./privacy";
export {
  BUILTIN_SCENARIO_IDS,
  MAX_ROWS_PER_ENTITY,
  MAX_ROWS_PER_RUN,
  builtinScenarios,
  clampScenario,
  totalRows,
  type BuiltinScenarioId,
} from "./scenarios";
export {
  SCHEMA_FILE_GLOBS,
  detectSchemaFormat,
  parseJsonSchema,
  parsePrisma,
  parseSchemaFile,
  parseSql,
  type ParseResult,
  type SchemaFormat,
} from "./parsers";
