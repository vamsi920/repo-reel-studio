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
import type { ProbeKind } from "#/lib/environment/types/probe";
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

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
}

/**
 * Posts a receipt back into the conversation.
 *
 * Client tools are acknowledged by the agent-server before the browser does
 * any work, so a follow-up message is the only channel that can carry a
 * result the agent needs -- the same constraint `reportLaunchResult` in
 * `child-conversation-launch.ts` works around.
 */
export function createConversationResultPoster(
  conversationId: string,
): PostResultFn {
  return (message: string) => {
    void AgentServerConversationService.sendMessage(conversationId, {
      role: "user",
      content: [{ type: "text", text: message }],
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
function describeEnvironment(): Record<string, unknown> {
  const studio = useOnboardingStudioStore.getState();
  return {
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
      set_setup_plan: "steps: [{ id, title, capability?, status? }]",
      advance_plan: "stepId, status",
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
      postReceipt(context, { status: "ok", ...describeEnvironment() });
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
        if (!key || !text || !isSection(entry.section)) {
          skipped.push(entry);
          continue;
        }
        facts.push({
          key,
          section: entry.section,
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

      studio.mergeFacts(facts);
      studio.pushCard({ id: "discovery", kind: "discovery" });
      postReceipt(context, {
        status: "recorded",
        count: facts.length,
        skipped: skipped.length,
        total_known: useOnboardingStudioStore.getState().facts.length,
      });
      return;
    }

    case "set_setup_plan": {
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
      const status =
        payload.status === "done" ||
        payload.status === "skipped" ||
        payload.status === "active"
          ? payload.status
          : "done";
      if (!stepId) {
        postReceipt(context, { status: "rejected", reason: "no_step_id" });
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
      postReceipt(context, { status: "ok", ...describeEnvironment() });
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
