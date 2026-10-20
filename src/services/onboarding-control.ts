import {
  DISCOVERY_CONFIDENCE,
  DISCOVERY_SECTIONS,
  ONBOARDING_CONTROL_COMMANDS,
  ONBOARDING_PROBE_KINDS,
  ONBOARDING_RESULT_PREFIX,
  ONBOARDING_VIEWS,
  type DiscoveryConfidence,
  type DiscoverySection,
  type OnboardingControlCommand,
} from "#/constants/onboarding-control";
import type { OnboardingControlAction } from "#/types/agent-server/core";
import {
  CAPABILITIES,
  type Capability,
} from "#/lib/environment/types/capability";
import {
  CONNECTOR_MANIFESTS,
  getConnectorManifest,
  resolveEgressUnion,
  secretFieldNames,
} from "#/lib/environment/registry";
import { PLATFORM_EGRESS } from "#/lib/environment/requirements/feature-requirements";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import {
  useOnboardingStudioStore,
  type DiscoveryFact,
  type SetupStep,
} from "#/stores/onboarding-studio-store";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import { completeOnboardingSessionForConversation } from "#/hooks/query/use-onboarding-session";
import type { ProbeKind } from "#/lib/environment/types/probe";
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import { snapshotConnections } from "#/lib/environment/connection-snapshot";
import { companyProfileRepository } from "#/lib/data-platform/repositories/company-profile-repository";
import { resolveOrgId } from "#/lib/data-platform/repositories/repository-identity";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useEventStore } from "#/stores/use-event-store";
import { isUserMessageEvent } from "#/types/agent-server/type-guards";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";

/**
 * Dispatcher for the `onboarding_control` client tool.
 *
 * The governing rule, and the reason this file was rewritten: **nothing here
 * navigates the browser.** The first version called `navigate()` the moment
 * the agent wanted to show a provider picker, which teleported the user out of
 * the conversation and onto a form grid mid-sentence. Every command now
 * renders into the workbench beside the chat instead.
 *
 * Two dispatch styles, both already established in this codebase:
 *  - Fire-and-forget, like `handleCanvasUIAction`: anything that only changes
 *    what is on screen.
 *  - Asynchronous with the outcome posted back as a follow-up message, like
 *    `handleLaunchChildConversationAction`: probes, credential requests and
 *    anything the agent must know the result of, because the server-side
 *    acknowledgement cannot carry it.
 *
 * Everything posted back is a redacted receipt. This module must never import
 * a type or value that can hold a credential; an eslint rule enforces that,
 * and `__tests__/services/onboarding-control.test.ts` asserts it behaviourally.
 */

export type PostResultFn = (message: string) => void;

interface DispatchContext {
  postResult: PostResultFn;
  /** Present for every real dispatch; absent only in unit tests that don't
   *  need `complete_setup`'s session bookkeeping. */
  conversationId?: string;
}

/**
 * Posts a receipt back into the conversation.
 *
 * Client tools are acknowledged by the agent-server before the browser does
 * any work, so a follow-up message is the only channel that can carry a
 * result the agent needs -- the same constraint `reportLaunchResult` in
 * `child-conversation-launch.ts` works around.
 */
/**
 * Case study (case-studies/onboarding): after most receipts Gemini answered
 * with an empty turn, which the runtime then had to nudge -- one wasted model
 * call per step. Every receipt now says what to do next unless it already
 * does.
 */
export const RECEIPT_NEXT_STEP =
  "Act on this now: call the next onboarding_control command, or write to the user. Do not reply empty.";

export function withNextStep(message: string): string {
  if (!message.startsWith(ONBOARDING_RESULT_PREFIX)) return message;
  try {
    const payload = JSON.parse(message.slice(ONBOARDING_RESULT_PREFIX.length));
    if (!payload || typeof payload !== "object" || "next" in payload) {
      return message;
    }
    return `${ONBOARDING_RESULT_PREFIX}${JSON.stringify({ ...payload, next: RECEIPT_NEXT_STEP })}`;
  } catch {
    return message;
  }
}

export function createConversationResultPoster(
  conversationId: string,
): PostResultFn {
  return (message: string) => {
    void AgentServerConversationService.sendMessage(conversationId, {
      role: "user",
      content: [{ type: "text", text: withNextStep(message) }],
    }).catch(() => {
      // A receipt that cannot be delivered must not break the dispatch; the
      // user still sees the outcome on screen.
    });
  };
}

function postReceipt(
  context: DispatchContext,
  payload: Record<string, unknown>,
) {
  context.postResult(`${ONBOARDING_RESULT_PREFIX}${JSON.stringify(payload)}`);
}

function isCommand(value: string): value is OnboardingControlCommand {
  return (ONBOARDING_CONTROL_COMMANDS as readonly string[]).includes(value);
}

function isCapability(value: string | null | undefined): value is Capability {
  return (
    Boolean(value) &&
    (CAPABILITIES as readonly string[]).includes(value as string)
  );
}

/** Monotonic-enough card ids without reaching for a uuid dependency. */
let cardSequence = 0;
function nextCardId(prefix: string): string {
  cardSequence += 1;
  return `${prefix}-${cardSequence}`;
}

function payloadOf(action: OnboardingControlAction): Record<string, unknown> {
  const payload = action.payload;
  return payload && typeof payload === "object" ? payload : {};
}

/**
 * Probe targets are intersected with what the registry declares.
 *
 * Without this, `run_probe` with an arbitrary host list is a port scanner the
 * agent can be talked into operating, executed from inside the customer's
 * network. The agent can only ask about hosts this product actually depends
 * on.
 */
function allowedProbeTargets(requested: string[]): {
  allowed: string[];
  rejected: string[];
} {
  const known = new Set(
    resolveEgressUnion(
      CONNECTOR_MANIFESTS.map((manifest) => manifest.id),
      PLATFORM_EGRESS,
    ).map((entry) => entry.host),
  );
  const allowed: string[] = [];
  const rejected: string[] = [];
  for (const target of requested) {
    if (known.has(target)) allowed.push(target);
    else rejected.push(target);
  }
  return { allowed, rejected };
}

function isSection(value: unknown): value is DiscoverySection {
  return (DISCOVERY_SECTIONS as readonly string[]).includes(value as string);
}

function isConfidence(value: unknown): value is DiscoveryConfidence {
  return (DISCOVERY_CONFIDENCE as readonly string[]).includes(value as string);
}

/**
 * Answers "what is there, and what am I allowed to do about it".
 *
 * Deliberately a command rather than schema enums: the provider catalogue
 * grows every time a connector is added, and baking it into the tool contract
 * would freeze it for the lifetime of every running agent-server.
 */
/** Plan statuses the agent may send, with the synonyms models actually use. */
function normalizePlanStatus(
  value: unknown,
): "active" | "done" | "skipped" | null {
  if (typeof value !== "string") return null;
  const status = value.trim().toLowerCase();
  if (status === "done" || status === "complete" || status === "completed")
    return "done";
  if (status === "skipped" || status === "skip") return "skipped";
  if (
    status === "active" ||
    status === "in_progress" ||
    status === "in-progress" ||
    status === "started"
  )
    return "active";
  return null;
}

/** Section names the agent commonly reaches for, mapped onto real ones. */
/** Whether the user typed this address in their own messages. */
function userTypedAddress(address: string): boolean {
  const needle = address.trim().toLowerCase();
  return useEventStore
    .getState()
    .events.some(
      (event) =>
        isUserMessageEvent(event) &&
        !parseMessageFromEvent(event).startsWith(ONBOARDING_RESULT_PREFIX) &&
        parseMessageFromEvent(event).toLowerCase().includes(needle),
    );
}

/** What has to be known before a setup plan makes sense. */
const PLAN_REQUIRES_SECTIONS: DiscoverySection[] = [
  "stack",
  "delivery",
  "systems",
];

const SECTION_ALIASES: Record<string, DiscoverySection> = {
  ci: "delivery",
  cicd: "delivery",
  "ci-cd": "delivery",
  deployment: "delivery",
  tooling: "systems",
  tools: "systems",
  scm: "systems",
  vcs: "systems",
  "source-control": "systems",
  "issue-tracker": "systems",
  "issue-tracking": "systems",
  infrastructure: "systems",
  databases: "systems",
  data: "systems",
  proxy: "network",
  networking: "network",
  security: "constraints",
  compliance: "constraints",
  people: "team",
  company: "org",
  // Round 3 of the case study: every "llm" fact was rejected and retried.
  llm: "systems",
  llms: "systems",
  model: "systems",
  models: "systems",
  ai: "systems",
  providers: "systems",
  environments: "delivery",
  envs: "delivery",
  release: "delivery",
  releases: "delivery",
  process: "delivery",
  location: "team",
  locations: "team",
};

function resolveSection(value: unknown): DiscoverySection | null {
  if (isSection(value)) return value;
  if (typeof value !== "string") return null;
  return SECTION_ALIASES[value.trim().toLowerCase()] ?? null;
}

async function persistFacts(facts: DiscoveryFact[]): Promise<boolean> {
  try {
    const orgId = await resolveOrgId();
    if (!orgId) return false;
    await companyProfileRepository.mergeFacts(orgId, facts);
    return true;
  } catch {
    return false;
  }
}

/**
 * Facts learned in earlier sessions, merged into this tab's store so the
 * workbench and describe both start from them.
 */
async function loadPersistedFacts(): Promise<void> {
  try {
    const orgId = await resolveOrgId();
    if (!orgId) return;
    const profile = await companyProfileRepository.get(orgId);
    if (profile?.facts.length) {
      useOnboardingStudioStore.getState().mergeFacts(profile.facts);
    }
    const local = useOnboardingStudioStore.getState().runtimeChecks;
    for (const record of profile?.runtimeChecks ?? []) {
      const mine = local.find(
        (existing) =>
          existing.providerId === record.providerId &&
          existing.instanceKey === record.instanceKey,
      );
      if (!mine || Date.parse(record.at) > Date.parse(mine.at)) {
        useOnboardingStudioStore.getState().recordRuntimeCheck(record);
      }
    }
  } catch {
    // Best effort: describe still answers from this session's facts.
  }
}

/**
 * The connection snapshot, with private-network connections that were
 * checked from the agent's runtime shown as what that check found. The
 * `connections` row only holds the Edge Function's verdict, which for an
 * internal host is always "could not call it".
 */
async function snapshotWithRuntimeChecks() {
  const snapshot = await snapshotConnections();
  const checks = useOnboardingStudioStore.getState().runtimeChecks;
  return {
    ...snapshot,
    connections: snapshot.connections.map((connection) => {
      const check = checks.find(
        (record) =>
          record.providerId === connection.provider &&
          record.capability === connection.capability,
      );
      if (!check) return connection;
      return {
        ...connection,
        status: check.ok ? "ok" : "error",
        needs_reconnect: check.ok ? false : connection.needs_reconnect,
        verified_from: "runtime",
        last_probe_at: check.at,
        ...(check.scheme === "http" ? { insecure_http: true } : {}),
        ...(check.failure ? { runtime_failure: check.failure } : {}),
        env: check.envNames,
      };
    }),
  };
}

async function describeEnvironment(): Promise<Record<string, unknown>> {
  await loadPersistedFacts();
  const studio = useOnboardingStudioStore.getState();
  const connectionState = await snapshotWithRuntimeChecks();
  return {
    // What is ALREADY connected, with health. Check this before asking the
    // user for anything, and offer a reconnect for any `needs_reconnect`.
    ...connectionState,
    commands: ONBOARDING_CONTROL_COMMANDS,
    capabilities: CAPABILITIES,
    probe_kinds: ONBOARDING_PROBE_KINDS,
    views: ONBOARDING_VIEWS,
    discovery_sections: DISCOVERY_SECTIONS,
    providers: CONNECTOR_MANIFESTS.map((manifest) => ({
      id: manifest.id,
      capability: manifest.capability,
      maturity: manifest.maturity,
      oauth: Boolean(manifest.oauth),
      self_hosted: Boolean(manifest.hostOverride),
      secret_fields: secretFieldNames(manifest),
      config_fields: manifest.fields
        .filter((field) => !field.secret)
        .map((field) => field.name),
      needs_egress: manifest.egress.map((entry) => entry.host),
    })),
    // Case study S5: with 29 facts loaded from an earlier session the agent
    // still re-asked every discovery question. Name what is known and what
    // is missing so a returning user is only asked about the gaps.
    ...(studio.facts.length > 0
      ? {
          returning: true,
          known_sections: DISCOVERY_SECTIONS.filter((section) =>
            studio.facts.some((fact) => fact.section === section),
          ),
          missing_sections: DISCOVERY_SECTIONS.filter(
            (section) => !studio.facts.some((fact) => fact.section === section),
          ),
        }
      : {}),
    known_facts: studio.facts.map((fact) => ({
      key: fact.key,
      section: fact.section,
      text: fact.text,
      confidence: fact.confidence,
    })),
    plan: studio.steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status,
    })),
    payload_shapes: {
      record_discovery: "facts: [{ key, section, text, confidence }]",
      set_setup_plan:
        "steps: [{ id, title, capability?, status? }]; refused until stack, delivery and systems are recorded (or reason given)",
      advance_plan:
        'stepId, status ("active" | "done" | "skipped"); skipped needs reason. A connection step is only done once its connection works.',
      propose_profile_change: "patch, (rationale on the top-level field)",
      run_probe: "(use probe_kind / targets / vantage top-level fields)",
      show_checklist: "featureIds: string[]",
      assign_task: "requirementId, assigneeEmail",
      navigate: "view",
    },
  };
}

export async function handleOnboardingControlAction(
  action: OnboardingControlAction,
  context: DispatchContext,
): Promise<void> {
  const copilot = useOnboardingCopilotStore.getState();
  const studio = useOnboardingStudioStore.getState();
  const payload = payloadOf(action);

  if (!isCommand(action.command)) {
    postReceipt(context, {
      status: "rejected",
      reason: "unknown_command",
      // Corrective rather than silent: the agent-server validates parameter
      // names but not enum values, so a wrong command reaches us intact and
      // the agent can only recover if we say what is valid.
      valid_commands: ONBOARDING_CONTROL_COMMANDS,
    });
    return;
  }

  switch (action.command) {
    case "describe": {
      postReceipt(context, { status: "ok", ...(await describeEnvironment()) });
      return;
    }

    case "record_discovery": {
      const raw = Array.isArray(payload.facts) ? payload.facts : [];
      if (raw.length === 0) {
        postReceipt(context, { status: "rejected", reason: "no_facts" });
        return;
      }

      // The interview is precisely where someone pastes a token in answer to
      // an innocent question. Recording it would put a live credential into a
      // member-readable document in plaintext, so a suspicious fact is
      // refused outright and the agent is told to ask again differently.
      const scan = scanForSecrets(raw);
      if (!scan.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "looks_like_credential",
          detail: scan.reason,
          at: scan.at,
          guidance:
            "Do not record credentials. Ask the user to rotate anything they pasted, and use request_credentials for the value itself.",
        });
        return;
      }

      const now = new Date().toISOString();
      const facts: DiscoveryFact[] = [];
      const skipped: unknown[] = [];
      for (const entry of raw as Record<string, unknown>[]) {
        const key = typeof entry.key === "string" ? entry.key : null;
        const text = typeof entry.text === "string" ? entry.text : null;
        // An unrecognised section is kept under "org" rather than refused:
        // a rejection only made the agent retry the same fact.
        const section =
          resolveSection(entry.section) ?? (key && text ? "org" : null);
        if (!key || !text || !section) {
          skipped.push(entry);
          continue;
        }
        facts.push({
          key,
          section,
          text,
          // Defaults to "inferred", the safer of the two: a fact wrongly
          // labelled as something the user said is how the agent starts
          // confidently telling people things they never told it.
          confidence: isConfidence(entry.confidence)
            ? entry.confidence
            : "inferred",
          at: now,
        });
      }

      if (facts.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_facts",
          valid_sections: DISCOVERY_SECTIONS,
        });
        return;
      }

      // Case study round 4: after a receipt, an empty reply and the
      // runtime's nudge, the agent re-sent the same three facts ~30 times. A
      // plain "recorded" read as progress; say plainly that nothing changed.
      const fresh = facts.filter((fact) => {
        const known = studio.facts.find(
          (existing) => existing.key === fact.key,
        );
        return known?.text !== fact.text || known?.section !== fact.section;
      });
      if (fresh.length === 0) {
        postReceipt(context, {
          status: "already_recorded",
          count: 0,
          next: "Nothing new was saved; these facts were already known. Do not record them again: ask the user your next question now.",
        });
        return;
      }

      studio.mergeFacts(facts);
      studio.pushCard({ id: "discovery", kind: "discovery" });
      // Kept on the org, not only in this tab: a later session, another
      // device or a colleague starts from what was already learned.
      const saved = await persistFacts(
        facts.map((fact) => ({ ...fact, source: context.conversationId })),
      );
      postReceipt(context, {
        status: "recorded",
        count: facts.length,
        skipped: skipped.length,
        total_known: useOnboardingStudioStore.getState().facts.length,
        saved_to_company_profile: saved,
      });
      return;
    }

    case "set_setup_plan": {
      // Interview first. Case study round 4: the agent planned before asking
      // a single question, connected the wrong things, and never learned
      // which issue tracker the company used.
      const missingCore = PLAN_REQUIRES_SECTIONS.filter(
        (section) => !studio.facts.some((fact) => fact.section === section),
      );
      if (missingCore.length > 0 && typeof payload.reason !== "string") {
        postReceipt(context, {
          status: "rejected",
          reason: "discovery_incomplete",
          missing_sections: missingCore,
          detail:
            "Ask about these first and record_discovery the answers. If the user asked to skip the interview, pass payload.reason.",
        });
        return;
      }
      const raw = Array.isArray(payload.steps) ? payload.steps : [];
      const steps: SetupStep[] = [];
      raw.forEach((entry, index) => {
        const record = entry as Record<string, unknown>;
        const title = typeof record.title === "string" ? record.title : null;
        if (!title) return;
        steps.push({
          id:
            typeof record.id === "string" && record.id
              ? record.id
              : `step-${index + 1}`,
          title,
          capability: isCapability(record.capability as string)
            ? (record.capability as Capability)
            : undefined,
          status: "pending",
        });
      });

      if (steps.length === 0) {
        postReceipt(context, { status: "rejected", reason: "no_steps" });
        return;
      }

      steps[0] = { ...steps[0], status: "active" };
      studio.setPlan(steps, steps[0].id);
      studio.pushCard({ id: "plan", kind: "plan" });
      postReceipt(context, { status: "planned", steps: steps.length });
      return;
    }

    case "advance_plan": {
      const stepId = typeof payload.stepId === "string" ? payload.stepId : null;
      // Any status it did not recognise used to count as "done": the
      // onboarding case study (case-studies/onboarding, S2) watched the agent
      // send "in_progress" for two steps it had not started, both came back
      // finished, and complete_setup then closed a session with nothing
      // connected.
      const status = normalizePlanStatus(payload.status);
      if (!stepId) {
        postReceipt(context, { status: "rejected", reason: "no_step_id" });
        return;
      }
      if (!status) {
        postReceipt(context, {
          status: "rejected",
          reason: "invalid_status",
          valid_statuses: ["active", "done", "skipped"],
        });
        return;
      }
      const step = studio.steps.find((candidate) => candidate.id === stepId);
      if (!step) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_step",
          steps: studio.steps.map((candidate) => candidate.id),
        });
        return;
      }
      // A connection step is done when a connection for it works, not when
      // the agent says so.
      if (status === "done" && step.capability) {
        // The provider this step is about: the last form opened for its
        // capability in this session. Case study round 3: an org's old Jira
        // Cloud connection let a "connect Linear" step pass after the Linear
        // form was cancelled.
        const formProviders = studio.cards
          .filter(
            (card): card is Extract<typeof card, { kind: "form" }> =>
              card.kind === "form" && card.capability === step.capability,
          )
          .map((card) => card.providerId);
        const provider = formProviders.at(-1);
        const snapshot = await snapshotWithRuntimeChecks();
        const working = snapshot.connections.some(
          (connection) =>
            connection.capability === step.capability &&
            (!provider || connection.provider === provider) &&
            connection.status === "ok" &&
            !connection.needs_reconnect,
        );
        if (!working && !snapshot.lookup_error) {
          postReceipt(context, {
            status: "rejected",
            reason: "not_verified",
            detail: `No working ${provider ?? step.capability} connection yet. Connect it with open_connection_form and wait for an ok receipt, or mark this step "skipped" with a reason the user agreed to.`,
          });
          return;
        }
      }
      if (status === "skipped" && typeof payload.reason !== "string") {
        postReceipt(context, {
          status: "rejected",
          reason: "skip_needs_reason",
        });
        return;
      }
      studio.advancePlan(stepId, status);
      const next = useOnboardingStudioStore.getState();
      postReceipt(context, {
        status: "advanced",
        current_step: next.currentStepId,
        remaining: next.steps.filter((step) => step.status === "pending")
          .length,
      });
      return;
    }

    case "get_environment_state": {
      postReceipt(context, { status: "ok", ...(await describeEnvironment()) });
      return;
    }

    case "show_provider_picker": {
      if (!isCapability(action.capability)) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_capability",
          valid_capabilities: CAPABILITIES,
        });
        return;
      }
      const providers = CONNECTOR_MANIFESTS.filter(
        (manifest) => manifest.capability === action.capability,
      );
      // Rendered beside the conversation. The original implementation
      // navigated here, which ended the conversation mid-sentence.
      studio.pushCard({
        id: nextCardId("picker"),
        kind: "picker",
        capability: action.capability,
        providerIds: providers.map((manifest) => manifest.id),
      });
      postReceipt(context, {
        status: "shown",
        capability: action.capability,
        providers: providers.map((manifest) => ({
          id: manifest.id,
          maturity: manifest.maturity,
          self_hosted: Boolean(manifest.hostOverride),
          needs_egress: manifest.egress.map((entry) => entry.host),
        })),
      });
      return;
    }

    case "open_connection_form":
    case "request_credentials": {
      const manifest = action.provider_id
        ? getConnectorManifest(action.provider_id)
        : undefined;
      if (!manifest) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_provider",
        });
        return;
      }

      const instanceKey = action.instance_key || "default";

      // `open_connection_form` shows the whole form (config + secrets);
      // `request_credentials` narrows to the secret fields, for a provider
      // whose configuration is already known.
      const secretFields = new Set(secretFieldNames(manifest));
      let fields: string[] | "all";
      if (action.command === "open_connection_form") {
        fields = "all";
      } else {
        const requested = (action.fields ?? []).filter((field) =>
          secretFields.has(field),
        );
        fields = requested.length > 0 ? requested : [...secretFields];
      }

      if (action.command === "request_credentials" && secretFields.size === 0) {
        postReceipt(context, {
          status: "not_applicable",
          reason: "provider_has_no_secret_fields",
          provider: manifest.id,
        });
        return;
      }

      studio.pushCard({
        id: `form:${manifest.id}:${instanceKey}`,
        kind: "form",
        capability: manifest.capability,
        providerId: manifest.id,
        instanceKey,
        fields,
        status: "open",
      });

      // Also raised on the dock, so a request made while the user has wandered
      // off to another screen is still noticeable.
      copilot.requestCredentials({
        requestId: `${manifest.id}:${instanceKey}`,
        capability: manifest.capability,
        providerId: manifest.id,
        instanceKey,
        fields: fields === "all" ? [...secretFields] : fields,
      });

      // No receipt yet: the form posts one once the value has gone
      // browser -> Edge Function and come back verified.
      return;
    }

    case "run_probe": {
      const kind = action.probe_kind ?? "";
      if (!(ONBOARDING_PROBE_KINDS as readonly string[]).includes(kind)) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_probe_kind",
          valid_probe_kinds: ONBOARDING_PROBE_KINDS,
        });
        return;
      }

      const requested = action.targets ?? [];
      const { allowed, rejected } =
        kind === "egress"
          ? allowedProbeTargets(requested)
          : { allowed: requested, rejected: [] };

      if (kind === "egress" && allowed.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_known_targets",
          rejected,
        });
        return;
      }

      if (action.vantage === "runtime") {
        // The runtime vantage is the customer's own workload host, which this
        // browser cannot reach. Telling the agent to run the preflight script
        // through its shell is both truthful and more useful than a result
        // from the wrong network.
        postReceipt(context, {
          status: "delegated",
          reason: "runtime_vantage_requires_workload_host",
          run: `node scripts/environment-preflight.mjs --json${
            allowed.length > 0 ? ` # targets: ${allowed.join(" ")}` : ""
          }`,
        });
        return;
      }

      try {
        const result = await EnvironmentService.probe(
          kind as ProbeKind,
          allowed,
        );
        studio.pushCard({
          id: nextCardId("probe"),
          kind: "probe",
          label: kind,
          result,
        });
        postReceipt(context, {
          status: result.ok ? "ok" : "failed",
          probe_kind: kind,
          vantage: result.vantage,
          latency_ms: result.latencyMs,
          checks: result.checks.map((check) => ({
            id: check.id,
            ok: check.ok,
            observed: check.observed,
          })),
          remediation: result.remediation?.codeKey,
          rejected_targets: rejected,
          // Repeated because it is the most commonly misread part of any
          // result: an "edge" pass does not mean the customer's network works.
          vantage_note:
            result.vantage === "edge"
              ? "This ran from the platform's network, not the customer's."
              : undefined,
        });
      } catch (error) {
        postReceipt(context, {
          status: "error",
          probe_kind: kind,
          reason: (error as Error)?.message ?? "probe_failed",
        });
      }
      return;
    }

    case "show_checklist": {
      const featureIds = Array.isArray(payload.featureIds)
        ? (payload.featureIds as string[])
        : [];
      studio.pushCard({
        id: nextCardId("checklist"),
        kind: "checklist",
        featureIds,
      });
      postReceipt(context, { status: "shown", feature_ids: featureIds });
      return;
    }

    case "propose_profile_change": {
      const patch =
        payload.patch && typeof payload.patch === "object"
          ? (payload.patch as Record<string, unknown>)
          : {};
      if (Object.keys(patch).length === 0) {
        postReceipt(context, { status: "rejected", reason: "empty_patch" });
        return;
      }
      // Never applied here. The patch is surfaced as a diff the user accepts
      // or discards, and applying it requires org admin.
      studio.pushCard({
        id: nextCardId("proposal"),
        kind: "proposal",
        patch,
        rationale: action.rationale ?? "",
        status: "pending",
      });
      postReceipt(context, {
        status: "awaiting_user",
        reason: "profile_changes_require_human_approval",
        patch_keys: Object.keys(patch),
      });
      return;
    }

    case "navigate": {
      const view =
        typeof payload.view === "string" ? payload.view : action.view;
      if (!view || !(ONBOARDING_VIEWS as readonly string[]).includes(view)) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_view",
          valid_views: ONBOARDING_VIEWS,
        });
        return;
      }
      // Focuses a workbench view. It does NOT move the browser: an agent that
      // can navigate the user away mid-conversation is the defect this whole
      // rewrite exists to remove.
      studio.setView(view);
      postReceipt(context, { status: "focused", view });
      return;
    }

    case "generate_handoff_packet": {
      try {
        const packet = await EnvironmentService.handoffPacket();
        studio.pushCard({
          id: nextCardId("handoff"),
          kind: "handoff",
          markdown: packet.markdown,
        });
        postReceipt(context, {
          status: "generated",
          bytes: packet.markdown.length,
        });
      } catch (error) {
        postReceipt(context, {
          status: "error",
          reason: (error as Error)?.message ?? "packet_failed",
        });
      }
      return;
    }

    case "assign_task": {
      const requirementId =
        typeof payload.requirementId === "string"
          ? payload.requirementId
          : null;
      const assigneeEmail =
        typeof payload.assigneeEmail === "string"
          ? payload.assigneeEmail
          : null;
      if (!requirementId) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_requirement_id",
        });
        return;
      }
      // Case study rounds 2-5: the agent assigned work to addresses nobody
      // gave it (it-team@, security-team@, iam-team@<company>). An assignee
      // has to be someone the user named in this conversation.
      if (assigneeEmail && !userTypedAddress(assigneeEmail)) {
        postReceipt(context, {
          status: "rejected",
          reason: "assignee_not_given_by_user",
          detail:
            "Ask the user who owns this and their address, or record it as an open question. Never make up an address.",
        });
        return;
      }
      try {
        await EnvironmentService.assignTask({
          requirementId,
          assigneeEmail: assigneeEmail ?? undefined,
          note: action.note ?? undefined,
        });
        postReceipt(context, {
          status: "assigned",
          requirement_id: requirementId,
          assignee: assigneeEmail,
        });
      } catch (error) {
        postReceipt(context, {
          status: "error",
          reason: (error as Error)?.message ?? "assign_failed",
        });
      }
      return;
    }

    case "complete_setup": {
      // Unfinished steps block completion: the agent must finish them, skip
      // them with a reason, or hand them off (assign_task) first.
      const outstanding = studio.steps.filter(
        (step) => step.status === "pending" || step.status === "active",
      );
      if (outstanding.length > 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "steps_outstanding",
          outstanding: outstanding.map((step) => ({
            id: step.id,
            title: step.title,
            status: step.status,
          })),
        });
        return;
      }
      // Awaited, and before the summary card is pushed: that card's own
      // mount effect invalidates and refetches the onboarding-session query,
      // and if that refetch won the race against this write, it cached the
      // session as still "active" for up to its staleTime -- reopening the
      // studio would resume the already-finished conversation instead of
      // offering a fresh one. Best-effort: a failed update must not stop the
      // agent from telling the user setup is done, but leaving the session
      // "active" would permanently block a fresh onboarding session for this
      // org (see the function doc), so we still push the card either way.
      if (context.conversationId) {
        await completeOnboardingSessionForConversation(
          context.conversationId,
        ).catch(() => undefined);
      }
      studio.pushCard({
        id: nextCardId("summary"),
        kind: "summary",
        readiness: null,
      });
      postReceipt(context, {
        status: "completed",
        // The agent does not get to declare victory over blocking work: the
        // summary card renders the real readiness report next to its claim.
        note: "The summary card shows the live readiness report, which may disagree.",
        next: "Now tell the user, in one short message, what is connected and verified, what was skipped or handed off, and what they should check first.",
      });
      return;
    }

    default: {
      // Exhaustiveness guard: adding a command to the enum without handling it
      // here should be a compile error, not a silent no-op.
      const never: never = action.command;
      postReceipt(context, {
        status: "not_implemented",
        command: String(never),
      });
    }
  }
}
