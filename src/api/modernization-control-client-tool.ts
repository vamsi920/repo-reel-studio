import type { ClientToolSpec } from "./canvas-ui-client-tool";
import {
  MODERNIZATION_CONTROL_COMMANDS,
  MODERNIZATION_CONTROL_TOOL_NAME,
} from "#/constants/modernization-control";

export {
  MODERNIZATION_CONTROL_ACTION_KIND,
  MODERNIZATION_CONTROL_COMMANDS,
  MODERNIZATION_CONTROL_TOOL_NAME,
  MODERNIZATION_RESULT_PREFIX,
} from "#/constants/modernization-control";

/**
 * The `modernization_control` client tool (Neo ME).
 *
 * Deliberately a thin envelope: `command` picks the verb and `payload`
 * carries the command-specific object. Per-command shapes stay out of the
 * schema so a new command never changes the registered schema (the
 * agent-server caches it per tool name for its whole life -- see
 * `src/constants/onboarding-control.ts`). The `describe` receipt documents
 * every payload shape for the agent at run time.
 *
 * `__tests__/api/modernization-control-schema.test.ts` snapshots this.
 */
export const MODERNIZATION_CONTROL_CLIENT_TOOL: ClientToolSpec = {
  name: MODERNIZATION_CONTROL_TOOL_NAME,
  description:
    "Drive the Neo ME modernization studio beside the chat. " +
    "Call describe first (and after any resume) to get the project state and the payload shape of every command. " +
    "record_discovery adds components of the legacy stack with evidence; ask_choice shows the user selectable cards with logos and WAITS for their answer (a '[neome result]' message); " +
    "set_plan publishes the migration plan; request_approval gates a risky step; update_progress, log and checkpoint feed the live migration box and make the run resumable; " +
    "complete files the final report (refused while steps are pending). Never write '[neome result]' yourself.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: {
        type: "string",
        enum: [...MODERNIZATION_CONTROL_COMMANDS],
        description: "Which studio command to run.",
      },
      payload: {
        type: "object",
        description:
          "Command-specific argument object (shapes documented by describe).",
      },
      rationale: {
        type: "string",
        description:
          "One sentence on why this command now; shown to the user in the transcript.",
      },
    },
    required: ["command"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
