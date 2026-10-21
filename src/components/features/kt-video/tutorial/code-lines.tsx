import React from "react";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { SyntaxHighlighter } from "#/components/features/markdown/syntax-highlighter";
import { THEME } from "./theme";

export const LINE_HEIGHT = 26;
export const CODE_FONT_SIZE = 16;

/**
 * Syntax-highlighted lines at a fixed line height, memoised on the code
 * string so Remotion's per-frame re-render never re-tokenises. Every
 * per-frame effect (scroll, highlight bands, callouts) is drawn by the
 * parent as an overlay aligned to `LINE_HEIGHT`.
 */
export const CodeLines = React.memo(function CodeLines({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  return (
    <SyntaxHighlighter
      language={language}
      style={vscDarkPlus}
      PreTag="div"
      customStyle={{
        background: "transparent",
        margin: 0,
        padding: 0,
        fontSize: CODE_FONT_SIZE,
        lineHeight: `${LINE_HEIGHT}px`,
        fontFamily: THEME.fontMono,
        overflow: "visible",
        whiteSpace: "pre",
      }}
      codeTagProps={{
        style: {
          fontFamily: THEME.fontMono,
          fontSize: CODE_FONT_SIZE,
          lineHeight: `${LINE_HEIGHT}px`,
          whiteSpace: "pre",
        },
      }}
      wrapLines
      lineProps={{
        style: { display: "block", height: LINE_HEIGHT, whiteSpace: "pre" },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
});
