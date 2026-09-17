import { useQuery } from "@tanstack/react-query";
import SkillsService from "#/api/skills-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SkillInfo } from "#/types/settings";
import { SKILLS_QUERY_KEYS } from "./query-keys";

/**
 * @param projectDir Workspace root to load project skills from. Conversation
 *   views pass the conversation's own workspace so the catalog matches the
 *   skills loaded into that conversation; the global Skills page omits it.
 *
 * Keyed by the active backend's id so switching backends fetches fresh data
 * instead of serving another backend's cached skill list.
 */
export const useSkills = (projectDir?: string) => {
  const { backend } = useActiveBackend();
  return useQuery<SkillInfo[]>({
    queryKey: SKILLS_QUERY_KEYS.byProjectDir(backend.id, projectDir),
    queryFn: () => SkillsService.getSkills(projectDir),
    staleTime: 1000 * 60 * 10, // 10 minutes – skill list rarely changes
    refetchOnWindowFocus: false,
  });
};
