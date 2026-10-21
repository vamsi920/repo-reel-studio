import type { ClientToolSpec } from "./canvas-ui-client-tool";
import {
  SYNTH_CONTROL_COMMANDS,
  SYNTH_CONTROL_TOOL_NAME,
} from "#/constants/synth-control";

export {
  SYNTH_CONTROL_ACTION_KIND,
  SYNTH_CONTROL_COMMANDS,
  SYNTH_CONTROL_TOOL_NAME,
  SYNTH_RESULT_PREFIX,
} from "#/constants/synth-control";

/**
 * The `synth_control` client tool (Neo Synth).
 *
 * A thin envelope, like `modernization_control`: `command` picks the verb
 * and `payload` carries the command-specific object. Per-command shapes stay
 * out of the schema so a new command never changes the registered schema
 * (the agent-server caches it per tool name for its whole life). The
 * `describe` receipt documents every payload shape at run time.
 *
 * `__tests__/api/synth-control-schema.test.ts` snapshots this.
 */
export const SYNTH_CONTROL_CLIENT_TOOL: ClientToolSpec = {
  name: SYNTH_CONTROL_TOOL_NAME,
  description:
    "Drive the Neo Synth synthetic-data studio beside the chat. " +
    "Call describe first (and after any resume) to get the project state, the schema files found, and the payload shape of every command. " +
    "import_schema parses Prisma/SQL/JSON Schema/OpenAPI files from the workspace; record_model, record_rules, record_flows and record_profile add what you read in the code; " +
    "ask_choice shows the user selectable cards and WAITS for their answer (a '[synth result]' message); set_scenarios defines datasets; " +
    "generate makes the studio generate, validate, export and write a dataset (the receipt carries the validation result and file paths); " +
    "report_verification records that the data was loaded or tested; complete files the summary (refused without a valid, verified run). Never write '[synth result]' yourself.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: {
        type: "string",
        enum: [...SYNTH_CONTROL_COMMANDS],
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
