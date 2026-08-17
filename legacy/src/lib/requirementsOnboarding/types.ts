// Shared types for the ported Requirements Engine (guided AI onboarding
// interview -> BRD/FRD/Application Summary). Mirrors
// document-query-flow/src/types/onboarding.ts verbatim so the ported UI and
// backend contract stay drop-in compatible with the source project.

export type ProjectType = "regulatory" | "non-regulatory" | "unknown";

/** Structured requirement state maintained across the onboarding conversation. */
export interface RequirementState {
  projectName: string;
  projectType: ProjectType;
  businessGoal: string;
  targetUsers: string[];
  userRoles: string[];
  coreWorkflows: string[];
  features: string[];
  integrations: string[];
  dataEntities: string[];
  nonFunctionalRequirements: string[];
  regulatoryRequirements: string[];
  auditAndCompliance: string[];
  assumptions: string[];
  risks: string[];
  outOfScope: string[];
  mvpScope: string[];
  futureScope: string[];
  openQuestions: string[];
  missingDetails: string[];
  completenessScore: number;
}

export const EMPTY_REQUIREMENT_STATE: RequirementState = {
  projectName: "",
  projectType: "unknown",
  businessGoal: "",
  targetUsers: [],
  userRoles: [],
  coreWorkflows: [],
  features: [],
  integrations: [],
  dataEntities: [],
  nonFunctionalRequirements: [],
  regulatoryRequirements: [],
  auditAndCompliance: [],
  assumptions: [],
  risks: [],
  outOfScope: [],
  mvpScope: [],
  futureScope: [],
  openQuestions: [],
  missingDetails: [],
  completenessScore: 0,
};

export interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
}

/** Extracted document page returned by the /extract endpoint. */
export interface DocumentPage {
  doc_type: string;
  page: number;
  text: string;
}

export interface OnboardingStepResponse {
  success: boolean;
  state: RequirementState;
  classificationReasoning: string;
  assistantMessage: string;
  questions: string[];
  readyToGenerate: boolean;
  error?: string;
}

export interface GeneratedDocs {
  success: boolean;
  brd: string;
  frd: string;
  summary: string;
  error?: string;
}
