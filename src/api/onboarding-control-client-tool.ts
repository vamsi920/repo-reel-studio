import type { ClientToolSpec } from "#/api/canvas-ui-client-tool";
import {
  ONBOARDING_CONTROL_COMMANDS,
  ONBOARDING_CONTROL_TOOL_NAME,
  ONBOARDING_PROBE_KINDS,
  ONBOARDING_VIEWS,
} from "#/constants/onboarding-control";
import { CAPABILITIES } from "#/lib/environment/types/capability";

export {
  ONBOARDING_CONTROL_ACTION_KIND,
  ONBOARDING_CONTROL_TOOL_NAME,
  ONBOARDING_RESULT_PREFIX,
} from "#/constants/onboarding-control";

const ONBOARDING_DESCRIPTION = `You are helping someone connect NeoDevEx to their company's stack. This tool
drives the Environment screen they are looking at: it shows pickers, asks for
credentials, runs checks, and proposes configuration changes.

You cannot see or handle credentials. There is no parameter on this tool that
accepts a secret value, by design. When something needs an API key or a token,
call request_credentials with the FIELD NAMES only; the user types the value
into a form that posts it straight to the server, and you receive back a
receipt with a masked summary and the verification result. Never ask the user
to paste a credential into the chat. If they do anyway, tell them to rotate it
and use the form instead.

When to call:

* The user needs to choose a provider for a capability (their git host, their
  vector store, their model provider) ->
    command="show_provider_picker", capability=<capability>

* A chosen provider needs credentials ->
    command="request_credentials", provider_id=<id>, fields=["apiKey", ...]

* You want to verify something rather than assume it ->
    command="run_probe", probe_kind=<kind>, targets=[...]
    Use probe_kind="egress" with vantage="runtime" to find out whether the
    machine running their agents can reach a host. The "edge" vantage only
    tells you what OUR servers can reach, which is a different network and
    frequently a different answer.

* You want to show what is still outstanding ->
    command="show_checklist", feature_ids=[...]

* You have worked out a configuration change (deployment mode, a mirror, a
  policy) -> command="propose_profile_change", profile_patch={...},
    rationale="..." The user sees a diff and decides. Nothing is applied by
    you.

* The user should be looking at a different tab ->
    command="navigate", view=<view>

* An outstanding item belongs to someone else (a network team, an IdP admin)
  -> command="assign_task", requirement_id=<id>, assignee_email=<email>

Work one step at a time. Run a probe before claiming something is fixed, and
say which vantage a result came from when it matters.`;

/**
 * Client tool the onboarding agent uses to drive the Environment screen.
 *
 * Modelled on CANVAS_UI_CLIENT_TOOL. The security-relevant property is
 * negative: there is no parameter anywhere in this schema that can carry a
 * credential value. Combined with `additionalProperties: false`, that makes
 * "the agent never sees a secret" a property of the interface rather than a
 * rule someone has to remember.
 */
export const ONBOARDING_CONTROL_CLIENT_TOOL: ClientToolSpec = {
  name: ONBOARDING_CONTROL_TOOL_NAME,
  description: ONBOARDING_DESCRIPTION,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: {
        type: "string",
        enum: [...ONBOARDING_CONTROL_COMMANDS],
        description: "Onboarding command to dispatch.",
      },
      capability: {
        type: "string",
        enum: [...CAPABILITIES],
        description:
          "Which capability this is about. Required for show_provider_picker and request_credentials.",
      },
      provider_id: {
        type: "string",
        description:
          'Connector id from the registry, e.g. "github", "pinecone", "jira-cloud".',
      },
      instance_key: {
        type: "string",
        description:
          'Distinguishes multiple instances of one provider (two GitHub orgs, prod vs staging). Defaults to "default".',
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description:
          "Field NAMES to ask the user for. Never values -- this tool cannot carry a credential.",
      },
      probe_kind: {
        type: "string",
        enum: [...ONBOARDING_PROBE_KINDS],
        description: "Which check to run. Required for run_probe.",
      },
      targets: {
        type: "array",
        items: { type: "string" },
        description:
          "Hosts or names the probe applies to. Restricted to hosts the connector registry declares.",
      },
      vantage: {
        type: "string",
        enum: ["browser", "edge", "runtime"],
        description:
          'Where to run the check from. "runtime" is the customer\'s own workload host and is the only vantage that describes their network.',
      },
      profile_patch: {
        type: "object",
        description:
          "JSON merge patch over the environment profile. Shown to the user as a diff; never applied automatically.",
      },
      rationale: {
        type: "string",
        description:
          "Why you are proposing this change, in one or two sentences.",
      },
      view: {
        type: "string",
        enum: [...ONBOARDING_VIEWS],
        description: "Which Environment tab to open. Required for navigate.",
      },
      feature_ids: {
        type: "array",
        items: { type: "string" },
        description: "Feature ids to show in the checklist.",
      },
      requirement_id: {
        type: "string",
        description: "Requirement to assign. Required for assign_task.",
      },
      assignee_email: {
        type: "string",
        description: "Who should own this requirement.",
      },
      note: {
        type: "string",
        description: "Context for whoever picks the task up.",
      },
    },
    required: ["command"],
  },
  annotations: {
    // Probes reach the network and profile changes alter configuration, so
    // this is neither read-only nor closed-world -- unlike canvas_ui_control.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};
