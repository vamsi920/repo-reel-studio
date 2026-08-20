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
// not a per-frame render step.
const svgCache = new Map<string, string>();
let renderCounter = 0;

function useMermaidSvg(source: string | undefined): string | null {
  const [svg, setSvg] = useState<string | null>(
    source ? (svgCache.get(source) ?? null) : null,
  );

  useEffect(() => {
    if (!source) return undefined;
    const cached = svgCache.get(source);
    if (cached) {
      setSvg(cached);
      return undefined;
    }

    ensureMermaidInitialized();
    let cancelled = false;
    renderCounter += 1;
    const renderId = `kt-mermaid-${renderCounter}`;

    mermaid
      .render(renderId, source)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        svgCache.set(source, rendered);
        setSvg(rendered);
      })
      .catch(() => {
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
          style={{ width: "100%", maxWidth: 900 }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span
          style={{
            color: "rgba(255,255,255,0.4)",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
          }}
        >
          Rendering diagram…
        </span>
      )}
    </div>
  );
}
