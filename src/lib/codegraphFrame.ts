import htmlTemplate from "@/lib/codegraph-template/index.html?raw";
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
})();
`;

export const buildCodegraphSrcDoc = (codegraph: CodegraphEngineData) => {
  const graphJson = JSON.stringify(codegraph.graph).replace(/<\//g, "<\\\\/");

  return htmlTemplate
    .replace("/* STYLES_PLACEHOLDER */", stylesTemplate)
    .replace("/* GRAPH_DATA_PLACEHOLDER */", graphJson)
    .replace("/* SCRIPT_PLACEHOLDER */", `${scriptTemplate}\n${bridgeScript}`);
};
