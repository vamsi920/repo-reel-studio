import React, { useEffect, useState, useSyncExternalStore } from "react";
import mermaid from "mermaid";
import type { ExtraProps } from "react-markdown";
import { code as defaultCode } from "./code";
import { currentAppearance, subscribeAppearance } from "#/themes/appearance";

/* eslint-disable i18next/no-literal-string -- mermaid status chrome */

type MermaidTheme = "dark" | "default";

let initializedTheme: MermaidTheme | null = null;
// Follows the app's appearance: the dark theme's pale lines and labels were
// unreadable on the light surface the app now defaults to.
function ensureMermaidInitialized(theme: MermaidTheme) {
  if (initializedTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "strict",
  });
  initializedTheme = theme;
}

function useMermaidTheme(): MermaidTheme {
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    currentAppearance,
    () => "dark" as const,
  );
  return appearance === "dark" ? "dark" : "default";
}

const svgCache = new Map<string, string>();
let renderCounter = 0;

function MermaidDiagram({ source }: { source: string }) {
  const theme = useMermaidTheme();
  const cacheKey = `${theme}:${source}`;
  const [svg, setSvg] = useState<string | null>(svgCache.get(cacheKey) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = svgCache.get(cacheKey);
    if (cached) {
      setSvg(cached);
      setFailed(false);
      return undefined;
    }
    ensureMermaidInitialized(theme);
    let cancelled = false;
    renderCounter += 1;
    const elementId = `kt-read-mermaid-${renderCounter}`;
    mermaid
      .render(elementId, source)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        svgCache.set(cacheKey, rendered);
        setSvg(rendered);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
        // Mermaid's own default error handler draws an error graphic into a
        // temporary node it creates for the render (id `d<elementId>`), but
        // never removes it when parsing throws — left alone, that node sits
        // in the page outside our component tree as a stray error banner.
        document.getElementById(`d${elementId}`)?.remove();
        document.getElementById(elementId)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [source, theme, cacheKey]);

  if (failed) {
    return (
      <div className="rounded-lg border border-[var(--oh-border)] p-4 text-xs text-[var(--oh-muted)]">
        This diagram couldn&apos;t be rendered.
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="rounded-lg border border-[var(--oh-border)] p-4 text-xs text-[var(--oh-muted)]">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="my-2 flex justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-deep)] p-4"
      // Trusted, locally-rendered SVG from mermaid.render() — not user HTML.

      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Drop-in replacement for the default markdown `code` renderer: renders
 * ```mermaid fences as the real diagram instead of a syntax-highlighted code
 * block, falling back to the default renderer for every other language.
 */
export function mermaidAwareCode(
  props: React.ClassAttributes<HTMLElement> &
    React.HTMLAttributes<HTMLElement> &
    ExtraProps,
) {
  const { className, children } = props;
  if (/language-mermaid/.test(className || "")) {
    const source = String(children).replace(/\n$/, "").trim();
    if (source) return <MermaidDiagram source={source} />;
  }
  return defaultCode(props);
}
