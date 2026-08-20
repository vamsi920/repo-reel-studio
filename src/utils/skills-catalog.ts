import {
  SKILLS_CATALOG,
  type SkillCatalogEntry,
} from "@openhands/extensions/skills";

/**
 * Public skill entries whose descriptions and triggers reference features
 * that are exclusive to OpenHands Cloud (a hosted product this local-only
 * deployment does not run or provide). Left in, they would present
 * nonfunctional, misattributed capabilities to users, so they are excluded
 * from every surface that consumes the bundled catalog.
 */
const CLOUD_ONLY_SKILL_NAMES = new Set([
  "openhands-api",
  "openhands-automation",
]);

export const SUPPORTED_SKILLS_CATALOG: SkillCatalogEntry[] =
  SKILLS_CATALOG.filter((entry) => !CLOUD_ONLY_SKILL_NAMES.has(entry.name));
