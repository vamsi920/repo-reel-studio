import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { Easing, interpolate } from "remotion";
import type { KtScene } from "#/lib/kt-video/build-manifest";

/* eslint-disable i18next/no-literal-string -- Remotion frame chrome */

let initialized = false;
function ensureMermaidInitialized() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict",
  });
  initialized = true;
}

// Rendered once per unique diagram source and reused across every mount —
// mermaid.render() is async and this is a purely decorative Player preview,
// not a per-frame render step. A parse failure is cached too (as `null`):
// Remotion remounts the scene on every loop, and re-running a render that
// is known to fail only re-spawns mermaid's error banner each time round.
type MermaidResult = string | null;
const svgCache = new Map<string, MermaidResult>();
let renderCounter = 0;

// A session can page through many repositories/knowledge pages, each with
// its own unique diagram sources — with no eviction, this module-level cache
// would grow for as long as the tab stays open. `Map` preserves insertion
// order, so the oldest entry is always the first key; drop it before adding
// a new one past the cap instead of tracking recency explicitly.
const MAX_SVG_CACHE_ENTRIES = 30;
function cacheSvg(source: string, result: MermaidResult) {
  if (!svgCache.has(source) && svgCache.size >= MAX_SVG_CACHE_ENTRIES) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
  svgCache.set(source, result);
}

/** `undefined` while rendering (or when there's no source to render at all),
 * `null` once mermaid has actually rejected the source. Conflating "never
 * attempted" with "attempted and failed" would show the parse-error banner
 * for a scene that never had a diagram to render in the first place. */
function useMermaidSvg(source: string | undefined): MermaidResult | undefined {
  const [svg, setSvg] = useState<MermaidResult | undefined>(() =>
    source ? svgCache.get(source) : undefined,
  );

  useEffect(() => {
    if (!source) {
      setSvg(undefined);
      return undefined;
    }
    if (svgCache.has(source)) {
      setSvg(svgCache.get(source));
      return undefined;
    }

    ensureMermaidInitialized();
    let cancelled = false;
    renderCounter += 1;
    const renderId = `kt-mermaid-${renderCounter}`;

    mermaid
      .render(renderId, source)
      .then(({ svg: rendered }) => {
        cacheSvg(source, rendered);
        if (!cancelled) setSvg(rendered);
      })
      .catch(() => {
        cacheSvg(source, null);
        if (!cancelled) setSvg(null);
        // Mermaid's own error handler draws into a temporary node it
        // creates for the render (id `d<renderId>`) but never removes on a
        // parse failure — clean it up so it doesn't linger as a stray
        // banner outside this component.
        document.getElementById(`d${renderId}`)?.remove();
        document.getElementById(renderId)?.remove();
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return svg;
}

/**
 * Renders the real Mermaid diagram DeepWiki generated — pre-rendered to SVG
 * once and cached, never re-drawn by an LLM. Shared by the
 * architecture/flow/diagram scene types, which differ only in narration.
 */
export function DiagramPanel({
  scene,
  relativeFrame,
}: {
  scene: KtScene;
  relativeFrame: number;
}) {
  const svg = useMermaidSvg(scene.mermaid);
  const enter = interpolate(relativeFrame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1100,
        minHeight: 320,
        borderRadius: 12,
        overflow: "hidden",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 16}px)`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        border: "1px solid rgba(34,224,255,0.25)",
        background: "#0b0e13",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      {svg ? (
        // Trusted, locally-rendered SVG from mermaid.render() — not user HTML.

        <div
          role="img"
          aria-label={`${scene.title} diagram`}
          style={{ width: "100%", maxWidth: 900 }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span
          role={svg === null ? "alert" : undefined}
          style={{
            color: "rgba(255,255,255,0.4)",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
          }}
        >
          {!scene.mermaid
            ? "No diagram source for this scene."
            : svg === null
              ? "This diagram couldn't be rendered from its source."
              : "Rendering diagram…"}
        </span>
      )}
    </div>
  );
}
