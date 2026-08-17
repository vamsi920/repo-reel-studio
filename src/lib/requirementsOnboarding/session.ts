// Persists the in-progress onboarding interview so a refresh doesn't lose it.
// Keyed by a random session id kept in sessionStorage (survives reload,
// cleared on tab close — matches the interview's own lifetime).

import { supabase } from "@/lib/supabaseClient";
import type { DocumentPage, OnboardingMessage, RequirementState } from "./types";

const SESSION_STORAGE_KEY = "reel_studio_onboarding_session";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getOrCreateSessionKey(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const key = newId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, key);
    return key;
  } catch {
    return newId();
  }
}

export function clearSessionKey(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

export interface OnboardingSessionSnapshot {
  state: RequirementState;
  messages: OnboardingMessage[];
  documents: DocumentPage[];
}

/** Best-effort resume of an in-progress interview. Returns null on any miss/failure. */
export async function loadOnboardingSession(
  sessionKey: string
): Promise<OnboardingSessionSnapshot | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("onboarding_sessions")
      .select("state, messages, documents")
      .eq("session_key", sessionKey)
      .maybeSingle();
    if (error || !data) return null;
    return {
      state: data.state as RequirementState,
      messages: (data.messages as OnboardingMessage[]) || [],
      documents: (data.documents as DocumentPage[]) || [],
    };
  } catch {
    return null;
  }
}

export function saveOnboardingSession(
  sessionKey: string,
  snapshot: OnboardingSessionSnapshot
): void {
  if (!supabase) return;
  void supabase.from("onboarding_sessions").upsert(
    {
      session_key: sessionKey,
      state: snapshot.state,
      messages: snapshot.messages,
      documents: snapshot.documents,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_key" }
  );
}

export function deleteOnboardingSession(sessionKey: string): void {
  if (!supabase) return;
  void supabase.from("onboarding_sessions").delete().eq("session_key", sessionKey);
}
