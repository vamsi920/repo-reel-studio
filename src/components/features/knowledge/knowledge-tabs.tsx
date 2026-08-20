import React from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Network, Video } from "lucide-react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export type KnowledgeTab = "docs" | "video" | "graph";

/**
 * The three ways to understand one workspace repository.
 *
 * Docs and Video KT already existed — Docs as the page list on the repository
 * route, Video KT as the "watch" mode on a page. Neither behaviour changes
 * here; this strip just gives all three surfaces one shared entry point, and
 * adds CodeGraph alongside them.
 */
export function KnowledgeTabs({
  repositoryId,
  active,
}: {
  repositoryId: string;
  active: KnowledgeTab;
}) {
  const { t } = useTranslation("openhands");
  const base = `/kt/${encodeURIComponent(repositoryId)}`;

  const tabs: {
    id: KnowledgeTab;
    label: string;
    to: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "docs",
      label: t(I18nKey.KT$TAB_DOCS),
      to: base,
      icon: <BookOpen className="size-3.5" aria-hidden />,
    },
    {
      id: "video",
      label: t(I18nKey.KT$TAB_VIDEO),
      to: `${base}/video`,
      icon: <Video className="size-3.5" aria-hidden />,
    },
    {
      id: "graph",
      label: t(I18nKey.KT$TAB_CODEGRAPH),
      to: `${base}/graph`,
      icon: <Network className="size-3.5" aria-hidden />,
    },
  ];

  return (
    <nav
      data-testid="knowledge-tabs"
      aria-label={t(I18nKey.CODEGRAPH$VIEWS_LABEL)}
      className="flex items-center gap-1 border-b border-[var(--oh-border)]"
    >
      {tabs.map((tab) => (
        <NavigationLink
          key={tab.id}
          to={tab.to}
          data-testid={`knowledge-tab-${tab.id}`}
          // The owning route tells us which tab is active, so we don't depend
          // on path matching: `/kt/:id` is a prefix of both `/kt/:id/graph` and
          // `/kt/:id/video`, which would light up Docs on every tab.
          data-active={tab.id === active}
          // `end` keeps NavigationLink's own active styling off Docs for the
          // same reason.
          end={tab.id === "docs"}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
            tab.id === active
              ? "border-[var(--primary-500)] font-medium text-[var(--primary-500)]"
              : "border-transparent text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]",
          )}
        >
          {tab.icon}
          {tab.label}
        </NavigationLink>
      ))}
    </nav>
  );
}
