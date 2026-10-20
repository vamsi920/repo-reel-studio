/**
 * Validates a model-routing decision the frontend reports for a run, and
 * shapes it into an audit row. Pure, dependency-free.
 *
 * The browser's router is the only thing that knows *why* a model was chosen
 * (the runtime just sees a switch_llm call), so it posts the decision here.
 * The payload is an allowlist of short fields — never prompt text — and is
 * size-capped, so a misbehaving client cannot turn the audit log into a
 * prompt archive.
 */

export const ROUTING_ACTIONS = ["model.routed", "model.fallback"];
export const MAX_ROUTING_BODY_BYTES = 4096;

const ALLOWED_KEYS = new Set([
  "action",
  "profile",
  "model",
  "tier",
  "source",
  "reasons",
  "score",
  "fromProfile",
  "errorKind",
]);
const TIERS = new Set(["light", "standard", "frontier"]);
const SHORT_STRING = /^[\w.:/@+-]{1,160}$/;

export class RoutingAnnotationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const optionalShort = (value, name) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !SHORT_STRING.test(value)) {
    throw new RoutingAnnotationError(`Invalid ${name}`);
  }
  return value;
};

export function parseRoutingAnnotation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RoutingAnnotationError("Body must be a JSON object");
  }
  if (JSON.stringify(body).length > MAX_ROUTING_BODY_BYTES) {
    throw new RoutingAnnotationError("Routing annotation too large");
  }
  const extra = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length > 0) {
    throw new RoutingAnnotationError(`Unexpected fields: ${extra.join(", ")}`);
  }
  if (!ROUTING_ACTIONS.includes(body.action)) {
    throw new RoutingAnnotationError("Unknown routing action");
  }
  const reasons = body.reasons ?? [];
  if (
    !Array.isArray(reasons) ||
    reasons.length > 12 ||
    reasons.some((r) => typeof r !== "string" || !/^[a-z_]{1,40}$/.test(r))
  ) {
    throw new RoutingAnnotationError("Invalid reasons");
  }
  if (body.tier != null && !TIERS.has(body.tier)) {
    throw new RoutingAnnotationError("Invalid tier");
  }
  if (
    body.score != null &&
    (typeof body.score !== "number" || body.score < 0 || body.score > 1)
  ) {
    throw new RoutingAnnotationError("Invalid score");
  }
  return {
    action: body.action,
    profile: optionalShort(body.profile, "profile"),
    model: optionalShort(body.model, "model"),
    tier: body.tier ?? null,
    source: optionalShort(body.source, "source"),
    reasons,
    score: body.score ?? null,
    fromProfile: optionalShort(body.fromProfile, "fromProfile"),
    errorKind: optionalShort(body.errorKind, "errorKind"),
  };
}

export function routingAuditRecord({ run, annotation, at }) {
  const target = annotation.model ?? annotation.profile ?? "unknown model";
  const summary =
    annotation.action === "model.fallback"
      ? `Auto fell back to ${target}` +
        (annotation.errorKind ? ` after ${annotation.errorKind}` : "")
      : `Auto routed to ${target}` +
        (annotation.reasons.length
          ? ` (${annotation.reasons.join(", ")})`
          : "");
  return {
    at,
    actor: "system",
    action: annotation.action,
    summary,
    entityType: "run",
    entityId: run.runId,
    workspaceId: run.workspaceId,
    metadata: {
      runId: run.runId,
      profile: annotation.profile,
      model: annotation.model,
      tier: annotation.tier,
      source: annotation.source,
      reasons: annotation.reasons,
      score: annotation.score,
      fromProfile: annotation.fromProfile,
      errorKind: annotation.errorKind,
    },
  };
}
