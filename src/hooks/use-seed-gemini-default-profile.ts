import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  useLlmProfiles,
  LLM_PROFILES_QUERY_KEYS,
} from "#/hooks/query/use-llm-profiles";
import ProfilesService from "#/api/profiles-service/profiles-service.api";

const NEODEVEX_GEMINI_PROFILE_NAME = "neodevex-gemini-default";

/**
 * First-run-only: if this is a local backend with zero LLM profiles and a
 * Gemini key is baked into the build (VITE_GEMINI_API_KEY), seed a default
 * profile pointing at Gemini so chat/onboarding works out of the box with no
 * manual Settings visit. Never runs again once any profile exists — doesn't
 * fight a user's own Settings changes.
 */
export function useSeedGeminiDefaultProfile(): void {
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";
  const { data: profilesData, isLoading } = useLlmProfiles({
    enabled: isLocal,
  });
  const queryClient = useQueryClient();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isLocal || isLoading || !profilesData || attemptedRef.current) return;
    if (profilesData.profiles.length > 0) return;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) return;

    const rawModel =
      (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ||
      "gemini-pro-latest";
    const model = rawModel.startsWith("gemini/")
      ? rawModel
      : `gemini/${rawModel.replace(/^google:/, "")}`;

    attemptedRef.current = true;

    ProfilesService.saveProfile(NEODEVEX_GEMINI_PROFILE_NAME, {
      llm: { model, api_key: apiKey },
    })
      .then(() => ProfilesService.activateProfile(NEODEVEX_GEMINI_PROFILE_NAME))
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: LLM_PROFILES_QUERY_KEYS.all,
        });
      })
      .catch((error) => {
        // Best-effort: leave attemptedRef set so we don't retry-loop against a
        // persistently failing agent-server; the user can still configure a
        // profile by hand in Settings.

        console.warn("Failed to seed default Gemini LLM profile", error);
      });
  }, [isLocal, isLoading, profilesData, queryClient]);
}
