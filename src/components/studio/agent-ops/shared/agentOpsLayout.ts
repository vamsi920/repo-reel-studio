/** Shared responsive layout + surface tokens for Agent Ops (aligned with Studio `gf-panel`). */
/** Split sidebar `340px` targets xl ≥1280; see `AGENT_OPS_VRT_VIEWPORTS` in `agentOpsDimensions.ts`. */
export const agentOpsPanelSurfaceClass =
  "min-w-0 max-w-full overflow-hidden rounded-[22px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.22)]";

/** Sidebar / board panels — lighter chrome to avoid stacked `gf-panel` clutter on narrow viewports. */
export const agentOpsNestedPanelClass =
  "min-w-0 max-w-full overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.025] shadow-none";

export const agentOpsFactStripClass =
  "flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden";

export const agentOpsPanelPaddingMd = "p-4 sm:p-5";

export const agentOpsShellSurfaceClass = agentOpsPanelSurfaceClass;

export const agentOpsRootClass = "min-w-0 max-w-full overflow-x-hidden";

/** Matches Studio graph section floor — reduces height jump when switching workspace tabs. */
export const agentOpsStudioSectionClass = "min-h-[680px] min-w-0 max-w-full";

/** Agent Ops root inside Studio main (fills section, no extra page-level panel). */
export const agentOpsStudioEmbedClass = `${agentOpsRootClass} ${agentOpsStudioSectionClass} flex flex-col`;

/** In-Studio toolbar chrome (lighter than nested `gf-panel` shells). */
export const agentOpsStudioChromeClass =
  "shrink-0 rounded-[22px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 sm:px-5 sm:py-3.5";

export const agentOpsStudioPanelClass = "min-h-0 flex-1 min-w-0 outline-none";

export const agentOpsSplitLayoutClass =
  "grid min-w-0 max-w-full grid-cols-1 gap-3 md:gap-4 xl:grid-cols-[minmax(0,min(340px,100%))_minmax(0,1fr)] xl:gap-5";

export const agentOpsSplitSidebarClass = "min-w-0 max-w-full space-y-3";

export const agentOpsSplitMainClass = "min-w-0 max-w-full space-y-3";

export const agentOpsInspectorShellClass = agentOpsPanelSurfaceClass;

export const agentOpsFieldLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40";

export const agentOpsProactiveMainGridClass =
  "grid min-w-0 max-w-full grid-cols-1 gap-3 md:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(min(100%,360px),380px)] xl:items-start";

export const agentOpsPathScrollClass = "min-w-0 max-w-full overflow-x-auto";

export const agentOpsMonoPathClass = "break-all font-mono text-[11px] sm:break-normal sm:truncate";

/** Responsive QA widths (pass 35): mobile / tablet / desktop. */
export const AGENT_OPS_RESPONSIVE_VIEWPORTS = {
  mobile: 390,
  tablet: 768,
  desktop: 1280,
} as const;

/** Final QA matrix (pass 38). */
export const AGENT_OPS_FINAL_QA_WIDTHS = [320, 390, 768, 1024, 1440] as const;
