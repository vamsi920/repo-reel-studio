import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import { SkillReadyItem } from "../event-content-helpers/create-skill-ready-event";
import { SkillItemExpanded } from "./skill-item-expanded";

interface SkillReadyContentListProps {
  items: SkillReadyItem[];
  /**
   * Translation key for the list header. Defaults to the "Triggered Skill
   * Knowledge:" label used by Skill Ready events; invoke-skill observations
   * pass "Invoked Skill Knowledge:" instead.
   */
  titleKey?: I18nKey;
}

export function SkillReadyContentList({
  items,
  titleKey = I18nKey.SKILLS$TRIGGERED_SKILL_KNOWLEDGE,
}: SkillReadyContentListProps) {
  const { t } = useTranslation("openhands");
  const [expandedSkills, setExpandedSkills] = React.useState<
    Record<string, boolean>
  >({});

  const toggleSkill = (expandKey: string) => {
    setExpandedSkills((prev) => ({ ...prev, [expandKey]: !prev[expandKey] }));
  };

  return (
    <div className="flex flex-col gap-1 mt-1">
      <Typography.Text className="font-bold text-[var(--oh-foreground)] text-sm px-2 py-1">
        {t(titleKey)}
      </Typography.Text>
      {items.map((item, index) => {
        // A single event can activate the same skill name more than once
        // (e.g. re-triggered by a later keyword match), so the name alone
        // isn't a safe key — pair it with position to keep each card's
        // expand state independent.
        const expandKey = `${item.name}-${index}`;
        const isExpanded = expandedSkills[expandKey] || false;

        return (
          <div
            key={expandKey}
            className="border border-[var(--oh-border-subtle)] rounded-md overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleSkill(expandKey)}
              className="w-full py-1.5 px-2 text-left flex items-center gap-2 hover:bg-tertiary transition-colors cursor-pointer"
            >
              <Typography.Text className="text-[var(--oh-text-tertiary)]">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </Typography.Text>
              <Typography.Text className="font-normal text-[var(--oh-foreground)] text-sm">
                {item.name}
              </Typography.Text>
            </button>

            {isExpanded && item.content && (
              <>
                <hr className="border-[var(--oh-border-subtle)]" />
                <SkillItemExpanded content={item.content} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
