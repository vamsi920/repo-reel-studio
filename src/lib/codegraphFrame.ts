import htmlTemplate from "@/lib/codegraph-template/index.html?raw";
import d3Bundle from "@/lib/codegraph-template/d3.v7.min.js?raw";
import scriptTemplate from "@/lib/codegraph-template/main.js?raw";
import stylesTemplate from "@/lib/codegraph-template/styles.css?raw";
import type { CodegraphEngineData } from "@/lib/types";

const bridgeScript = `
(function () {
  function postSelection(node) {
    if (!node) return;
    const filePath = node.fullPath || node.parent || "";
    try {
      window.parent.postMessage(
        {
          type: "codegraph-node",
          payload: {
            id: node.id,
            label: node.label || node.id,
            nodeType: node.type || "",
            filePath: filePath,
          },
        },
        "*"
      );
    } catch (error) {
      console.error("codegraph bridge error", error);
    }
  }

  if (typeof window.toggleCollapse === "function") {
    const originalToggleCollapse = window.toggleCollapse;
    window.toggleCollapse = function patchedToggleCollapse(node) {
      postSelection(node);
      return originalToggleCollapse.apply(this, arguments);
    };
  }

  if (typeof window.highlightNode === "function") {
    const originalHighlightNode = window.highlightNode;
    window.highlightNode = function patchedHighlightNode(nodeId) {
      const node = (window.graphData?.nodes || []).find((candidate) => candidate.id === nodeId);
      postSelection(node);
      return originalHighlightNode.apply(this, arguments);
    };
  }

  window.addEventListener("message", function (event) {
    const data = event.data || {};
    if (data.type === "highlightPath" && typeof window.highlightPath === "function") {
      window.highlightPath(data.nodeLabels || [], data.edges || []);
    }
    if (data.type === "clearHighlight" && typeof window.clearHighlight === "function") {
      window.clearHighlight();
    }
  });
})();
`;

export const buildCodegraphSrcDoc = (codegraph: CodegraphEngineData) => {
  const graphJson = JSON.stringify(codegraph.graph).replace(/<\//g, "<\\\\/");

  // D3 is bundled locally (src/lib/codegraph-template/d3.v7.min.js, vendored
  // from the `d3` npm package) rather than loaded from a CDN <script src>.
  // The iframe's srcDoc has no network access guarantee (sandboxed, and this
  // must keep working offline/behind a strict CSP) -- see buildCodegraphSrcDoc
  // tests asserting no http(s):// references appear in the output.
  //
  // Every substitution below uses a replacer FUNCTION, not a plain string.
  // String.prototype.replace() special-cases "$&", "$'", "$`", "$$" etc. in a
  // string replacement argument -- the vendored d3 bundle's own minified
  // source contains a literal "$&" (a regex replacement pattern inside one
  // of its number-formatting helpers), which silently reinserted the
  // "/* D3_PLACEHOLDER */" marker text into the output when this used a
  // plain-string replace. The same class of bug already existed latently for
  // graphJson/scriptTemplate (arbitrary repo-derived content, e.g. a code
  // snippet containing a template literal, could contain those sequences
  // too) -- function replacers are immune to this since their return value
  // is inserted verbatim.
  return htmlTemplate
    .replace("/* D3_PLACEHOLDER */", () => d3Bundle)
    .replace("/* STYLES_PLACEHOLDER */", () => stylesTemplate)
    .replace("/* GRAPH_DATA_PLACEHOLDER */", () => graphJson)
    .replace("/* SCRIPT_PLACEHOLDER */", () => `${scriptTemplate}\n${bridgeScript}`);
};
