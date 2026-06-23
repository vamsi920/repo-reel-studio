export const PROACTIVE_TARGET_COUNT_MIN = 1;
export const PROACTIVE_TARGET_COUNT_MAX = 6;
export const PROACTIVE_TIMEZONE_MAX_LEN = 64;
export const PROACTIVE_QUALITY_MODE_MAX_LEN = 32;
export const MORNING_DEADLINE_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MORNING_DEADLINE_LOOSE_PATTERN = /^(\d{1,2}):([0-5]\d)$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/g;

export type ProactiveConfigPatchInput = {
  enabled?: boolean;
  targetCount?: number;
  qualityMode?: string;
  timezone?: string;
  morningDeadline?: string;
};

export class ProactiveConfigValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ProactiveConfigValidationError";
    this.field = field;
  }
}

export function clampTargetCount(value: unknown, field = "targetCount"): number {
  if (typeof value === "boolean") {
    throw new ProactiveConfigValidationError(
      field,
      `${field} must be an integer between ${PROACTIVE_TARGET_COUNT_MIN} and ${PROACTIVE_TARGET_COUNT_MAX}`,
    );
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    throw new ProactiveConfigValidationError(
      field,
      `${field} must be an integer between ${PROACTIVE_TARGET_COUNT_MIN} and ${PROACTIVE_TARGET_COUNT_MAX}`,
    );
  }
  return Math.max(PROACTIVE_TARGET_COUNT_MIN, Math.min(Math.trunc(parsed), PROACTIVE_TARGET_COUNT_MAX));
}

export function sanitizeTimezone(value: unknown, defaultValue = "local"): string {
  const text = String(value ?? "")
    .replace(CONTROL_CHAR_PATTERN, "")
    .trim();
  if (!text) return defaultValue;
  return text.slice(0, PROACTIVE_TIMEZONE_MAX_LEN);
}

export function sanitizeQualityMode(value: unknown, defaultValue = "high"): string {
  const text = String(value ?? "")
    .replace(CONTROL_CHAR_PATTERN, "")
    .trim();
  if (!text) return defaultValue;
  return text.slice(0, PROACTIVE_QUALITY_MODE_MAX_LEN);
}

export function coerceMorningDeadline(value: unknown, defaultValue = "09:00"): string {
  const text = String(value ?? "")
    .replace(CONTROL_CHAR_PATTERN, "")
    .trim();
  if (MORNING_DEADLINE_PATTERN.test(text)) return text;
  const loose = MORNING_DEADLINE_LOOSE_PATTERN.exec(text);
  if (loose) {
    const hour = Number.parseInt(loose[1], 10);
    const minute = loose[2];
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  return defaultValue;
}

export function validateMorningDeadline(value: unknown, field = "morningDeadline"): string {
  const text = String(value ?? "")
    .replace(CONTROL_CHAR_PATTERN, "")
    .trim();
  if (MORNING_DEADLINE_PATTERN.test(text)) return text;
  const loose = MORNING_DEADLINE_LOOSE_PATTERN.exec(text);
  if (loose) {
    const hour = Number.parseInt(loose[1], 10);
    const minute = loose[2];
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  throw new ProactiveConfigValidationError(
    field,
    `${field} must use 24-hour HH:MM format (example: 09:00)`,
  );
}

export function validateProactiveConfigPatch(patch: ProactiveConfigPatchInput): ProactiveConfigPatchInput {
  const normalized: ProactiveConfigPatchInput = {};
  if (patch.enabled !== undefined && patch.enabled !== null) {
    normalized.enabled = Boolean(patch.enabled);
  }
  if (patch.targetCount !== undefined && patch.targetCount !== null) {
    normalized.targetCount = clampTargetCount(patch.targetCount);
  }
  if (patch.qualityMode !== undefined && patch.qualityMode !== null) {
    normalized.qualityMode = sanitizeQualityMode(patch.qualityMode);
  }
  if (patch.timezone !== undefined && patch.timezone !== null) {
    normalized.timezone = sanitizeTimezone(patch.timezone);
  }
  if (patch.morningDeadline !== undefined && patch.morningDeadline !== null) {
    normalized.morningDeadline = validateMorningDeadline(patch.morningDeadline);
  }
  return normalized;
}

export function normalizeProactiveConfig<T extends {
  repoUrl: string;
  projectId?: string | null;
  enabled?: unknown;
  targetCount?: unknown;
  qualityMode?: unknown;
  timezone?: unknown;
  morningDeadline?: unknown;
  updatedAt?: unknown;
}>(raw: T) {
  let targetCount = PROACTIVE_TARGET_COUNT_MAX;
  try {
    targetCount = clampTargetCount(raw.targetCount ?? PROACTIVE_TARGET_COUNT_MAX);
  } catch {
    targetCount = PROACTIVE_TARGET_COUNT_MAX;
  }
  return {
    ...raw,
    projectId: raw.projectId ?? null,
    enabled: Boolean(raw.enabled),
    targetCount,
    qualityMode: sanitizeQualityMode(raw.qualityMode),
    timezone: sanitizeTimezone(raw.timezone),
    morningDeadline: coerceMorningDeadline(raw.morningDeadline),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}
