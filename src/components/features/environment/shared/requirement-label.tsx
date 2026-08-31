import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { RequirementNode } from "#/lib/environment/types/requirements";
import { CAPABILITY_LABEL_KEY } from "#/lib/environment/display";
import {
  getDeploymentDefect,
  getEnvPair,
} from "#/lib/environment/requirements/feature-requirements";

/**
 * Turns a requirement node into something a person can act on.
 *
 * Environment variable and host names are rendered verbatim rather than
 * translated: whoever fixes this will be typing the literal string into a
 * dashboard, and a localised approximation of `VITE_SESSION_API_KEY` would be
 * actively harmful.
 */
export function useRequirementLabel(): (node: RequirementNode) => string {
  const { t } = useTranslation("openhands");

  return (node: RequirementNode): string => {
    switch (node.kind) {
      case "capability":
        return t(CAPABILITY_LABEL_KEY[node.capability]);
      case "env":
        return `${node.name}${node.expected ? `=${node.expected}` : ""}`;
      case "env-pair": {
        const pair = getEnvPair(node.id);
        if (!pair) return node.id;
        return `${pair.a.name} = ${pair.b.name}`;
      }
      case "pg-extension":
        return `extension ${node.name}`;
      case "host-binary":
        return node.minVersion
          ? `${node.name} >= ${node.minVersion}`
          : node.name;
      case "egress":
        return `${node.host}:${node.port}`;
      case "inbound":
        return node.path;
      case "storage-bucket":
        return node.name;
      case "deployment-defect": {
        const defect = getDeploymentDefect(node.id);
        return defect ? t(defect.nameKey) : node.id;
      }
      default:
        return t(I18nKey.ENVIRONMENT$STATUS_UNKNOWN);
    }
  };
}

/** Scope hint shown beside an env requirement, so people know where to look. */
export function requirementScopeHint(node: RequirementNode): string | null {
  if (node.kind === "env") return node.scope;
  if (node.kind === "env-pair") return "netlify + fly";
  return null;
}
