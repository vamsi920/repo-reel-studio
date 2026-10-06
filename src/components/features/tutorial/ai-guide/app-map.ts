import type { I18nKey } from "#/i18n/declaration";
import { getTutorialSteps } from "../tutorial-steps";

/** The home page; always a valid destination. */
const HOME_ROUTE = "/conversations";

/**
 * Pages the AI guide may navigate to with its `go_to_page` tool: every page
 * the static tour visits, plus home. The guide can only point at things on
 * these pages, never jump to an arbitrary URL.
 */
export function getAiGuideAllowedRoutes(): string[] {
  const routes = new Set<string>([HOME_ROUTE]);
  for (const step of getTutorialSteps()) {
    if (step.route) routes.add(step.route);
  }
  return [...routes];
}

/**
 * Product knowledge for the AI guide, built from the static tour's own copy:
 * one line per page with what lives there. It lets the agent know where
 * something is before it has seen that page, so it can jump straight there
 * instead of exploring.
 */
export function buildAiGuideAppMap(translate: (key: I18nKey) => string) {
  const lines: string[] = [];
  for (const step of getTutorialSteps()) {
    if (!step.route) continue;
    const points = (step.pointKeys ?? []).map(translate).join(" ");
    lines.push(
      `- ${step.route}: ${translate(step.titleKey)}. ${translate(step.subtitleKey)} ${points}`.trim(),
    );
  }
  return lines.join("\n");
}
