// Public surface of the vendored Layman compression engine. Nothing outside
// this directory should import `./compression-core` or `./compression-policy`
// directly — go through this barrel so the vendored files stay swappable when
// upstream moves.
//
// Layman is MIT licensed, Copyright (c) 2026 Julius Brussee.
// See THIRD_PARTY_NOTICES.md.

export {
  compressForPrompt,
  compressMarkdownProseOnly,
  compressMarkdownProseOnlyWithValidation,
  detectCompressionContentKind,
  detectSensitivePath,
  estimateTokenMetrics,
  estimateTokens,
  evaluateCompressionEligibility,
  protectProseForLaymanCompression,
  restoreProtectedLaymanTokens,
  segmentMarkdownForCompression,
  summarizeTokenEstimates,
  validateCompressedMarkdown,
  DEFAULT_LAYMAN_PRESERVATION_RULES,
} from "./compression-core";

export type {
  LaymanBriefMode,
  LaymanCompressionMode,
  LaymanContentKind,
  LaymanPreservationRules,
  LaymanPromptCompressionOptions,
  LaymanPromptCompressionResult,
  LaymanTokenEstimateMetrics,
  LaymanValidatedCompressionResult,
  LaymanValidationResult,
} from "./compression-core";

export {
  clearLaymanCompressionInstrumentation,
  compressForPromptWithPolicy,
  configureLaymanCompressionPolicy,
  evaluateLaymanPolicy,
  getLaymanCompressionInstrumentationReport,
  getLaymanCompressionPolicy,
  getLaymanIntegrationSafetyPolicy,
  recordLaymanCompressionRollback,
  resetLaymanCompressionPolicy,
} from "./compression-policy";

export type {
  LaymanCompressionContext,
  LaymanCompressionInstrumentationReport,
  LaymanCompressionPolicy,
  LaymanPolicyDecision,
} from "./compression-policy";
