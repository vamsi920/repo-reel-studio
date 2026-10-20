import { useTranslation } from "react-i18next";
import { Replace } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { defineVisualizer } from "../define";
import { MODERNIZATION_CONTROL_ACTION_KIND } from "#/constants/modernization-control";

/**
 * Renders a `modernization_control` call in the transcript as one quiet
 * line ("Neo ME · asked: Which backend framework?"). The real content is in
 * the studio panel; the transcript only needs to show that the agent acted.
 */
export const modernizationVisualizer = defineVisualizer({
  actionKinds: [MODERNIZATION_CONTROL_ACTION_KIND],
  Body: ({ action }) => {
    const { t } = useTranslation("openhands");
    if (!action) return null;
    const { command, payload, rationale } = action.action;
    const p = (payload ?? {}) as Record<string, unknown>;
    const detail =
      typeof p.title === "string"
        ? p.title
        : typeof p.label === "string"
          ? p.label
          : typeof p.what === "string"
            ? p.what
            : typeof p.text === "string"
              ? p.text
              : typeof p.summary === "string"
                ? p.summary
                : Array.isArray(p.components)
                  ? `${p.components.length} components`
                  : Array.isArray(p.steps)
                    ? `${p.steps.length} steps`
                    : "";

    return (
      <div
        data-testid="modernization-control-visualizer"
        data-command={command}
        className="flex items-center gap-2 text-sm"
      >
        <Replace size={14} aria-hidden className="text-[var(--primary-500)]" />
        <span className="text-[var(--text-secondary)]">
          {t(I18nKey.NEOME$TITLE)} · {command.replace(/_/g, " ")}
          {detail ? `: ${detail}` : ""}
        </span>
        {rationale ? (
          <span className="truncate text-xs text-[var(--text-tertiary)]">
            — {rationale}
          </span>
        ) : null}
      </div>
    );
  },
});
