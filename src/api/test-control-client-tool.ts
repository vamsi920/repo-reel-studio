import type { ClientToolSpec } from "./canvas-ui-client-tool";
import {
  TEST_CONTROL_COMMANDS,
  TEST_CONTROL_TOOL_NAME,
} from "#/constants/test-control";

export {
  TEST_CONTROL_ACTION_KIND,
  TEST_CONTROL_COMMANDS,
  TEST_CONTROL_TOOL_NAME,
  TEST_RESULT_PREFIX,
} from "#/constants/test-control";

/**
 * The `test_control` client tool (Neo Test).
 *
 * A thin envelope, like `synth_control`: `command` picks the verb and
 * `payload` carries the command-specific object. Per-command shapes stay out
 * of the schema so a new command never changes the registered schema (the
 * agent-server caches it per tool name for its whole life). The `describe`
 * receipt documents every payload shape at run time.
 *
 * `__tests__/api/test-control-schema.test.ts` snapshots this.
 */
export const TEST_CONTROL_CLIENT_TOOL: ClientToolSpec = {
  name: TEST_CONTROL_TOOL_NAME,
  description:
    "Drive the Neo Test testing studio beside the chat. " +
    "Call describe first (and after any resume) to get the project state, the stack, the plan, the gates, past runs, KT docs, Synth datasets and the payload shape of every command. " +
    "record_stack records languages, frameworks, runners and commands; set_plan defines the suites (one kind each: unit, integration, api, e2e, performance, data, security, accessibility, contract, mutation) with commands and result files; set_gates sets thresholds; " +
    "ask_choice shows the user selectable cards and WAITS for their answer (a '[neotest result]' message); run makes the studio execute suites with its harness and parse the real results (the receipt carries the numbers); " +
    "prove mutates a file and runs a suite to show the tests catch bugs; record_finding files a bug with evidence; complete files the summary (refused until the plan ran and the report exists). Never write '[neotest result]' yourself.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: {
        type: "string",
        enum: [...TEST_CONTROL_COMMANDS],
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
