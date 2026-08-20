import React, { useEffect, useState } from "react";
import mermaid from "mermaid";
import type { ExtraProps } from "react-markdown";
import { code as defaultCode } from "./code";

/* eslint-disable i18next/no-literal-string -- mermaid status chrome */

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

const svgCache = new Map<string, string>();
let renderCounter = 0;

function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(svgCache.get(source) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = svgCache.get(source);
    if (cached) {
      setSvg(cached);
      setFailed(false);
      return undefined;
    }
    ensureMermaidInitialized();
    let cancelled = false;
    renderCounter += 1;
    const elementId = `kt-read-mermaid-${renderCounter}`;
    mermaid
      .render(elementId, source)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        svgCache.set(source, rendered);
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
  }, [source]);

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
