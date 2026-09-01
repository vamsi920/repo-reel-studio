import type { ClientToolSpec } from "#/api/canvas-ui-client-tool";
import {
  ONBOARDING_CONTROL_COMMANDS,
  ONBOARDING_CONTROL_TOOL_NAME,
  ONBOARDING_PROBE_KINDS,
} from "#/constants/onboarding-control";
import { CAPABILITIES } from "#/lib/environment/types/capability";

export {
  ONBOARDING_CONTROL_ACTION_KIND,
  ONBOARDING_CONTROL_TOOL_NAME,
  ONBOARDING_RESULT_PREFIX,
} from "#/constants/onboarding-control";

const ONBOARDING_DESCRIPTION = `You are onboarding NeoDevEx into a company whose stack you do not yet know.
This tool renders into the panel beside the chat. It never navigates the user
away -- you are having a conversation, not driving a wizard.

Start every session with command="describe". It returns the live catalogue:
available commands, capabilities, every provider with its fields and required
egress, what is already connected, and whether this user is allowed to write
connections at all. Do not guess any of that; ask for it.

You cannot see or handle credentials. No parameter here accepts a secret
value. When a provider needs a key, call request_credentials with the FIELD
NAMES; the user types the value into a form that posts it straight to the
server, and you get back a masked receipt with the verification result. Never
ask anyone to paste a credential into the chat. If they do anyway, tell them
to rotate it and use the form.

How to work:

1. Interview first. Ask about their stack, how they ship, their constraints --
   one topic at a time, like a colleague would. After each answer call
   record_discovery so it is remembered. Mark anything you worked out yourself
   as confidence="inferred", never as something they said.
2. Once the shape is clear, call set_setup_plan with the ordered steps, then
   advance_plan as each one lands. The user should always be able to see what
   is left.
3. To connect something: show_provider_picker for the capability, then
   open_connection_form once they choose. The form tests itself on submit and
   you get the result -- if it fails, read the remediation and help, do not
   start over.
4. Verify rather than assume. run_probe before claiming something works, and
   say which vantage the answer came from: "edge" is our network, not theirs.
5. propose_profile_change for configuration you have worked out. A human
   accepts it. Never describe a proposal as though it were applied.
6. complete_setup only when the blocking work is actually done.

If describe says this user cannot write connections, do not fight it: finish
the interview, then use assign_task and generate_handoff_packet so whoever
does have the access gets everything they need in one go.

Structured arguments for a command go in \`payload\`. describe tells you the
shape each command expects.`;

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
          "Connector id, exactly as returned by the `describe` command. Not enumerated here: the catalogue grows whenever a connector is added, and freezing it into this schema would force every running agent-server to restart.",
      },
      instance_key: {
        type: "string",
        description:
          'Distinguishes multiple instances of one provider -- two source-control organisations, or production and staging of the same vector store. Defaults to "default".',
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
      payload: {
        type: "object",
        description:
          "Structured argument for this command -- plan steps, discovered facts, a profile patch, a probe kind, a view name. `describe` returns the shape each command expects. Deliberately untyped so adding a command later needs no schema change, which would otherwise force every running agent-server to restart.",
      },
      rationale: {
        type: "string",
        description:
          "Why you are doing this, in one or two sentences. Shown to the user.",
      },
      note: {
        type: "string",
        description: "Short human-facing context to render alongside the card.",
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
