/**
 * Attributes specific to workflow spans.
 *
 * Vendored from `agentops/semconv/workflow.py` (MIT), reduced to the
 * attributes NeoDevEx has a real source for. Upstream's agno-specific
 * session/media/output-metadata groups are not ported.
 */

export const WorkflowAttributes = Object.freeze({
  /** Name of the workflow. */
  WORKFLOW_NAME: "workflow.name",
  /** Type of workflow. */
  WORKFLOW_TYPE: "workflow.type",
  /** Unique identifier for the workflow instance. */
  WORKFLOW_ID: "workflow.workflow_id",
  /** Unique identifier for this workflow run. */
  WORKFLOW_RUN_ID: "workflow.run_id",
  /** Description of the workflow. */
  WORKFLOW_DESCRIPTION: "workflow.description",

  /** Input to the workflow. */
  WORKFLOW_INPUT: "workflow.input",
  /** Output from the workflow. */
  WORKFLOW_OUTPUT: "workflow.output",
  /** Final output of the workflow. */
  WORKFLOW_FINAL_OUTPUT: "workflow.final_output",

  /** Type of workflow step. */
  WORKFLOW_STEP_TYPE: "workflow.step.type",
  /** Status of the workflow step. */
  WORKFLOW_STEP_STATUS: "workflow.step.status",

  /** Maximum number of turns in a workflow. */
  WORKFLOW_MAX_TURNS: "workflow.max_turns",

  /** Session ID for the workflow execution. */
  WORKFLOW_SESSION_ID: "workflow.session_id",
  /** Session name for the workflow. */
  WORKFLOW_SESSION_NAME: "workflow.session_name",
  /** User ID associated with the workflow. */
  WORKFLOW_USER_ID: "workflow.user_id",
});
