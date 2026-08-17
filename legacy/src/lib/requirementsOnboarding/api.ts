// API client for the ported Requirements Engine. Talks to
// server/requirements_engine_app.py (mounted at /api/requirements), proxied
// by Vite in dev and by the deployed backend origin in prod — same pattern
// Processing.tsx uses for /api/ingest.

import { API_URL } from "@/env";
import type {
  DocumentPage,
  GeneratedDocs,
  OnboardingMessage,
  OnboardingStepResponse,
  RequirementState,
} from "./types";

function requirementsUrl(path: string): string {
  return API_URL === "/api"
    ? `/api/requirements${path}`
    : `${API_URL}/api/requirements${path}`;
}

/** Extract text from uploaded PDFs via the Requirements Engine's /extract endpoint. */
export async function extractDocuments(
  files: File[],
  docTypes: string[]
): Promise<DocumentPage[]> {
  const formData = new FormData();
  files.forEach((file, idx) => {
    formData.append("files", file);
    formData.append("doc_types", docTypes[idx] ?? "technical");
  });

  const res = await fetch(requirementsUrl("/extract"), {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to extract documents: ${text}`);
  }
  return res.json();
}

/** Advance the onboarding conversation by one turn. */
export async function onboardingStep(params: {
  messages: OnboardingMessage[];
  state: RequirementState | null;
  documents?: DocumentPage[];
  idea?: string;
}): Promise<OnboardingStepResponse> {
  const res = await fetch(requirementsUrl("/onboarding/step"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages,
      state: params.state,
      documents: params.documents ?? null,
      idea: params.idea ?? null,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as OnboardingStepResponse;
  if (!res.ok || !data.success) {
    throw new Error(data?.error || `Onboarding step failed (${res.status})`);
  }
  return data;
}

/** Generate BRD, FRD, and Application Summary from the final requirement state. */
export async function generateDocuments(params: {
  state: RequirementState;
  documents?: DocumentPage[];
}): Promise<GeneratedDocs> {
  const res = await fetch(requirementsUrl("/onboarding/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state: params.state,
      documents: params.documents ?? null,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as GeneratedDocs;
  if (!res.ok || !data.success) {
    throw new Error(data?.error || `Document generation failed (${res.status})`);
  }
  return data;
}
