import React from "react";
import { motion } from "framer-motion";
import {
  Apple,
  BookOpen,
  Cloud,
  Globe,
  Monitor,
  PlayCircle,
  Workflow,
} from "lucide-react";
import { PLATFORM, PlatformVisual } from "./landing-copy";

const EASE = [0.22, 1, 0.36, 1] as const;

const STATE_STYLE: Record<string, string> = {
  done: "bg-[rgba(18,161,80,0.1)] text-[var(--lp-green)]",
  running: "bg-[rgba(11,129,183,0.1)] text-[var(--lp-primary)]",
  approval: "bg-[rgba(217,119,6,0.12)] text-[var(--lp-amber)]",
};

function AgentVisual() {
  return (
    <div className="lp-mono flex flex-col gap-1.5 rounded-xl bg-[#f8fafc] p-4 text-[12px] ring-1 ring-[var(--lp-line)]">
      {PLATFORM.agentLines.map((line, i) => (
        <motion.div
          key={line}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + i * 0.18 }}
          className="truncate text-[var(--lp-ink-2)]"
        >
          <span className="text-[var(--lp-primary)]">{"› "}</span>
          {line}
        </motion.div>
      ))}
    </div>
  );
}

function KnowledgeVisual() {
  return (
    <div className="flex flex-col gap-2">
      {PLATFORM.kt.map((page, i) => (
        <div
          key={page}
          className="flex items-center gap-2 rounded-lg bg-[#f8fafc] px-3 py-2 text-[13px] text-[var(--lp-ink-2)]"
        >
          <BookOpen size={14} className="text-[var(--lp-primary)]" />
          {page}
          {i === 0 && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--lp-cyan)]" />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-lg bg-[var(--lp-ink)] px-3 py-2 text-[13px] text-[#fff]">
        <PlayCircle size={15} />
        {PLATFORM.ktVideo}
      </div>
    </div>
  );
}

function AgentOpsVisual() {
  return (
    <div className="flex flex-col gap-2">
      {PLATFORM.opsRuns.map((run) => (
        <div
          key={run.name}
          className="flex items-center gap-3 rounded-lg bg-[#f8fafc] px-3 py-2 text-[13px]"
        >
          <span className="truncate text-[var(--lp-ink-2)]">{run.name}</span>
          <span className="lp-mono ml-auto text-[var(--lp-ink-3)]">
            {run.cost}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[run.state]}`}
          >
            {PLATFORM.opsStates[run.state as keyof typeof PLATFORM.opsStates]}
          </span>
        </div>
      ))}
    </div>
  );
}

function AutomationsVisual() {
  return (
    <div className="lp-mono flex flex-col gap-2 text-[12px]">
      <div className="flex items-center gap-2 rounded-lg bg-[rgba(91,108,240,0.08)] px-3 py-2 text-[#3b47b8]">
        <Workflow size={14} />
        {PLATFORM.automationTrigger}
      </div>
      <div className="ml-4 h-4 w-px bg-[var(--lp-line-strong)]" />
      <div className="truncate rounded-lg bg-[rgba(18,161,80,0.08)] px-3 py-2 text-[#067647]">
        {PLATFORM.automationResult}
      </div>
    </div>
  );
}

function RoutingVisual() {
  return (
    <div className="flex items-center gap-3">
      <span className="lp-gradient-bg rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#fff]">
        {PLATFORM.routingLabel}
      </span>
      <div className="flex flex-1 flex-col gap-1.5">
        {PLATFORM.routingModels.map((model, i) => (
          <motion.div
            key={model}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.6, ease: EASE }}
            className={`origin-left rounded-md px-2 py-1 text-[11px] ${
              i === 1
                ? "bg-[rgba(11,129,183,0.12)] font-medium text-[var(--lp-primary)]"
                : "bg-[#f1f5f9] text-[var(--lp-ink-3)]"
            }`}
          >
            {model}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const ANYWHERE_ICONS = [Globe, Apple, Monitor, Cloud];

function AnywhereVisual() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PLATFORM.anywhere.map((place, i) => {
        const Icon = ANYWHERE_ICONS[i];
        return (
          <div
            key={place}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-[#f8fafc] py-3 text-[11px] text-[var(--lp-ink-2)]"
          >
            <Icon size={18} className="text-[var(--lp-primary)]" />
            {place}
          </div>
        );
      })}
    </div>
  );
}

const VISUALS: Record<PlatformVisual, React.FC> = {
  agent: AgentVisual,
  knowledge: KnowledgeVisual,
  agentops: AgentOpsVisual,
  automations: AutomationsVisual,
  routing: RoutingVisual,
  anywhere: AnywhereVisual,
};

/** Bento layout: the two big cards span two columns on wide screens. */
const SPANS = ["lg:col-span-2", "", "", "lg:col-span-2", "", ""];

function trackPointer(event: React.MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty(
    "--mx",
    `${event.clientX - rect.left}px`,
  );
  event.currentTarget.style.setProperty(
    "--my",
    `${event.clientY - rect.top}px`,
  );
}

export function LandingPlatform() {
  return (
    <section id="platform" className="px-4 py-28 md:px-6 md:py-36">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EASE }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="lp-eyebrow">{PLATFORM.eyebrow}</span>
          <h2 className="mt-4 text-[clamp(2rem,4.5vw,3.6rem)] leading-[1.04] font-semibold tracking-[-0.035em]">
            {PLATFORM.title}
          </h2>
          <p className="mt-5 text-lg text-[var(--lp-ink-2)]">
            {PLATFORM.subtitle}
          </p>
        </motion.div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLATFORM.items.map((item, i) => {
            const Visual = VISUALS[item.visual];
            return (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{
                  duration: 0.7,
                  delay: (i % 3) * 0.08,
                  ease: EASE,
                }}
                whileHover={{ y: -4 }}
                onMouseMove={trackPointer}
                className={`lp-card lp-spotlight flex flex-col gap-6 p-6 md:p-7 ${SPANS[i]}`}
              >
                <div className="relative">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-ink-2)]">
                    {item.description}
                  </p>
                </div>
                <div className="relative mt-auto">
                  <Visual />
                </div>
                <div className="relative flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[var(--lp-line)] px-2.5 py-0.5 text-[11px] text-[var(--lp-ink-3)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
