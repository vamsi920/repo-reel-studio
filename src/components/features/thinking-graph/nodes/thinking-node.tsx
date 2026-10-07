import React from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  FileCode2,
  GitFork,
  Globe,
  Layers,
  ListChecks,
  MessageSquareText,
  Plug,
  Search,
  Sparkles,
  Star,
  Target,
  Terminal,
  Undo2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { nodeAccent } from "../agent-palette";
import type {
  ThinkingGraphNode,
  ThinkingNodeKind,
  ToolCategory,
} from "../thinking-graph-types";
import type { SubagentStep } from "../subagent-trace";

export type ThinkingFlowNode = Node<
  ThinkingGraphNode & { laneLabel?: string },
  "thinking"
>;

const TOOL_ICONS: Record<ToolCategory, LucideIcon> = {
  terminal: Terminal,
  file: FileCode2,
  search: Search,
  browser: Globe,
  mcp: Plug,
  other: Wrench,
};

const KIND_ICONS: Partial<Record<ThinkingNodeKind, LucideIcon>> = {
  goal: Target,
  thought: Brain,
  plan: ListChecks,
  fork: GitFork,
  agent: Bot,
  result: Undo2,
  reply: MessageSquareText,
  finish: Star,
  error: AlertTriangle,
  cluster: Layers,
};

const KIND_LABEL_KEYS: Partial<Record<ThinkingNodeKind, I18nKey>> = {
  goal: I18nKey.THINKING_GRAPH$GOAL,
  thought: I18nKey.THINKING_GRAPH$THOUGHT,
  plan: I18nKey.THINKING_GRAPH$PLAN,
  fork: I18nKey.THINKING_GRAPH$FORK,
  agent: I18nKey.THINKING_GRAPH$AGENT,
  result: I18nKey.THINKING_GRAPH$RESULT,
  reply: I18nKey.THINKING_GRAPH$REPLY,
  finish: I18nKey.THINKING_GRAPH$FINISH,
  error: I18nKey.THINKING_GRAPH$ERROR,
};

/** Strip the `<cmd>` / `<path>` rich-text markers translation strings carry. */
const plain = (text: string) => text.replace(/<\/?[a-z]+>/gi, "");

export function useNodeText(node: ThinkingGraphNode): {
  heading: string;
  body: string;
} {
  const { t } = useTranslation("openhands");
  const kindKey = KIND_LABEL_KEYS[node.kind];
  let heading = kindKey ? t(kindKey) : "";
  let { label: body } = node;
  if (node.kind === "cluster") {
    heading = t(I18nKey.THINKING_GRAPH$CLUSTER, { count: node.count ?? 0 });
    body = t(I18nKey.THINKING_GRAPH$EXPAND_HINT);
  }
  if (node.kind === "fork" && (node.count ?? 0) > 1) {
    body = t(I18nKey.THINKING_GRAPH$PARALLEL, { count: node.count });
  }
  if (node.kind === "tool" && !body && node.title) {
    body =
      node.title.kind === "text"
        ? node.title.text
        : plain(t(node.title.key, node.title.values as Record<string, string>));
  }
  return { heading, body };
}

/** Most recent sub-agent steps shown inside its lane card. */
const VISIBLE_STEPS = 4;

const STEP_DOT: Record<SubagentStep["status"], string> = {
  running: "animate-pulse",
  done: "",
  error: "",
};

function SubagentSteps({
  steps,
  accent,
}: {
  steps: SubagentStep[];
  accent: string;
}) {
  const { t } = useTranslation("openhands");
  const hidden = Math.max(steps.length - VISIBLE_STEPS, 0);
  return (
    <ul
      data-testid="subagent-steps"
      className="mt-2 flex flex-col gap-1 border-t border-dashed pt-1.5"
      style={{ borderColor: `color-mix(in srgb, ${accent} 35%, #e2e8f0)` }}
    >
      {hidden > 0 && (
        <li className="font-mono text-[10px] text-[#64748b]">
          {t(I18nKey.THINKING_GRAPH$EARLIER_STEPS, { count: hidden })}
        </li>
      )}
      {steps.slice(-VISIBLE_STEPS).map((step) => (
        <li
          key={step.id}
          className="flex items-center gap-1.5 font-mono text-[10px] text-[#334155]"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-[1px]",
              STEP_DOT[step.status],
            )}
            style={{
              backgroundColor: step.status === "error" ? "#e5484d" : accent,
              opacity: step.status === "done" ? 0.55 : 1,
            }}
          />
          <span className="shrink-0 text-[#64748b]">{step.tool}</span>
          <span className="truncate">{step.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ThinkingNodeImpl({ data }: NodeProps<ThinkingFlowNode>) {
  const accent = nodeAccent(data.kind, data.lane, data.toolCategory);
  const Icon =
    data.kind === "tool" && data.toolCategory
      ? TOOL_ICONS[data.toolCategory]
      : (KIND_ICONS[data.kind] ?? Sparkles);
  const { heading, body } = useNodeText(data);
  const style = { "--tg-accent": accent } as React.CSSProperties;

  return (
    <div
      data-testid={`thinking-node-${data.kind}`}
      className={cn(
        "tg-node",
        `tg-node--${data.kind}`,
        data.status === "running" && "tg-node--running",
        data.status === "error" && "tg-node--error",
        "py-2 pl-3.5 pr-3",
        "w-[210px]",
      )}
      style={style}
    >
      <Handle
        type="target"
        position={data.flow === "rtl" ? Position.Right : Position.Left}
        className="tg-port"
        style={{ borderColor: accent }}
      />
      {data.status === "running" && <span className="tg-orbit" />}
      {data.kind === "finish" && <span className="tg-burst" />}

      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm"
          style={{
            backgroundColor:
              data.kind === "goal"
                ? "#ffffff"
                : `color-mix(in srgb, ${accent} 14%, #ffffff)`,
            color: accent,
          }}
        >
          <Icon size={14} strokeWidth={2.25} />
        </span>
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.1em] opacity-75">
          {data.laneLabel ?? heading}
        </span>
        {data.status === "done" &&
          data.kind !== "goal" &&
          data.kind !== "thought" && (
            <CheckCircle2
              size={13}
              className="ml-auto shrink-0"
              style={{ color: accent }}
            />
          )}
      </div>

      {body && (
        <p
          className={cn(
            "mt-1.5 line-clamp-3 break-words text-xs leading-snug",
            data.kind === "goal" ? "font-medium" : "text-[#475569]",
          )}
        >
          {body}
        </p>
      )}

      {data.kind === "agent" && data.steps && data.steps.length > 0 && (
        <SubagentSteps steps={data.steps} accent={accent} />
      )}

      {data.kind === "plan" && data.items && (
        <ul className="mt-2 flex flex-col gap-1">
          {data.items.slice(0, 6).map((item, index) => (
            <li
              // Plan items have no ids; position is their identity.
              key={index}
              className="flex items-center gap-1.5 text-[11px] text-[#475569]"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-[1px]",
                  item.status === "in_progress" && "animate-pulse",
                )}
                style={{
                  background: item.status === "todo" ? "transparent" : accent,
                  border: `1.5px solid ${accent}`,
                }}
              />
              <span
                className={cn(
                  "truncate",
                  item.status === "done" && "line-through opacity-60",
                )}
              >
                {item.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Handle
        type="source"
        position={data.flow === "rtl" ? Position.Left : Position.Right}
        className="tg-port"
        style={{ borderColor: accent }}
      />
    </div>
  );
}

export const ThinkingNode = React.memo(ThinkingNodeImpl);
