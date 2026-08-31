import {
  ONBOARDING_CONTROL_COMMANDS,
  ONBOARDING_PROBE_KINDS,
  ONBOARDING_RESULT_PREFIX,
  ONBOARDING_VIEWS,
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
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ProbeKind } from "#/lib/environment/types/probe";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { buildAgentCanvasPath } from "#/utils/base-path";

/**
 * Dispatcher for the `onboarding_control` client tool.
 *
 * Two dispatch styles, both already established in this codebase:
 *
 *  - Fire-and-forget, like `handleCanvasUIAction`: navigation and anything
 *    that only changes what the user is looking at.
 *  - Asynchronous with the outcome posted back as a follow-up message, like
 *    `handleLaunchChildConversationAction`: probes and credential requests,
 *    where the agent genuinely needs the result and the server-side
 *    acknowledgement cannot carry it.
 *
 * Everything posted back is a redacted receipt. This module must never import
 * a type or value that can hold a credential; an eslint rule enforces that,
 * and `__tests__/services/onboarding-control.test.ts` asserts it behaviourally.
 */

export type PostResultFn = (message: string) => void;

interface DispatchContext {
  postResult: PostResultFn;
  navigate: (path: string) => void;
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

export async function handleOnboardingControlAction(
  action: OnboardingControlAction,
  context: DispatchContext,
): Promise<void> {
  const store = useOnboardingCopilotStore.getState();

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
    case "navigate": {
      const view = action.view ?? "overview";
      if (!(ONBOARDING_VIEWS as readonly string[]).includes(view)) {
        postReceipt(context, {
          status: "rejected",
          reason: "unknown_view",
          valid_views: ONBOARDING_VIEWS,
        });
        return;
      }
      context.navigate(
        buildAgentCanvasPath(
          view === "overview" ? "/environment" : `/environment/${view}`,
        ),
      );
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
      store.open_();
      context.navigate(buildAgentCanvasPath("/environment/connections"));
      const providers = CONNECTOR_MANIFESTS.filter(
        (manifest) => manifest.capability === action.capability,
      ).map((manifest) => ({
        id: manifest.id,
        maturity: manifest.maturity,
        self_hosted: Boolean(manifest.hostOverride),
        needs_egress: manifest.egress.map((entry) => entry.host),
      }));
      postReceipt(context, {
        status: "shown",
        capability: action.capability,
        providers,
      });
      return;
    }

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

      // Only fields the manifest marks secret can be requested this way, and
      // the agent supplied names only -- there is nowhere in the action for a
      // value to have travelled.
      const secretFields = new Set(secretFieldNames(manifest));
      const requested = (action.fields ?? []).filter((field) =>
        secretFields.has(field),
      );
      const fields = requested.length > 0 ? requested : [...secretFields];

      if (fields.length === 0) {
        postReceipt(context, {
          status: "not_applicable",
          reason: "provider_has_no_secret_fields",
          provider: manifest.id,
        });
        return;
      }

      store.requestCredentials({
        requestId: `${manifest.id}:${Date.now()}`,
        capability: manifest.capability,
        providerId: manifest.id,
        instanceKey: action.instance_key || "default",
        fields,
      });

      // The receipt for this command is posted later, by the credential sheet,
      // once the value has gone browser -> Edge Function and come back
      // verified. Nothing is reported here because nothing has happened yet.
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
      store.open_();
      context.navigate(buildAgentCanvasPath("/environment/requirements"));
      postReceipt(context, {
        status: "shown",
        feature_ids: action.feature_ids ?? [],
      });
      return;
    }

    case "propose_profile_change": {
      // Never applied here. The patch is surfaced as a diff the user accepts
      // or discards, and applying it requires org admin.
      store.open_();
      postReceipt(context, {
        status: "awaiting_user",
        reason: "profile_changes_require_human_approval",
        patch_keys: Object.keys(action.profile_patch ?? {}),
      });
      return;
    }

    case "generate_handoff_packet": {
      try {
        const packet = await EnvironmentService.handoffPacket();
        context.navigate(buildAgentCanvasPath("/environment/runbook"));
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
      context.navigate(buildAgentCanvasPath("/environment/requirements"));
      postReceipt(context, {
        status: "not_implemented",
        command: action.command,
        requirement_id: action.requirement_id ?? null,
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
