import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Download,
  FileCode2,
  Network,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCodegraphSrcDoc } from "@/lib/codegraphFrame";
import { getCodegraphData } from "@/lib/upstreamCodegraph";
import type { CodegraphCsvRow, GitNexusGraphData, GitNexusNode } from "@/lib/types";

interface GraphExplorerProps {
  graphData: GitNexusGraphData;
  activeFilePath?: string;
  onNodeClick?: (node: GitNexusNode) => void;
}

const serializeCsv = (rows: CodegraphCsvRow[]) => {
  if (rows.length === 0) return "";
  const header = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const text = `${value ?? ""}`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    header.join(","),
    ...rows.map((row) =>
      header.map((key) => escape(row[key as keyof CodegraphCsvRow] ?? "")).join(",")
    ),
  ].join("\n");
};

const downloadText = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export default function GraphExplorer({
  graphData,
  activeFilePath,
  onNodeClick,
}: GraphExplorerProps) {
  const codegraph = getCodegraphData(graphData);
  const isFallbackGraph = codegraph?.source === "gitnexus-fallback";
  const srcDoc = useMemo(
    () => (codegraph ? buildCodegraphSrcDoc(codegraph) : ""),
    [codegraph]
  );
  const [selectedNode, setSelectedNode] = useState<{
    label: string;
    nodeType: string;
    filePath: string;
  } | null>(null);

  const fileNodeLookup = useMemo(
    () =>
      new Map(
        graphData.nodes
          .filter((node) => node.kind === "File")
          .map((node) => [node.filePath, node] as const)
      ),
    [graphData.nodes]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "codegraph-node") return;
      const payload = event.data?.payload;
      if (!payload) return;

      setSelectedNode({
        label: payload.label || payload.id || "Selected node",
        nodeType: payload.nodeType || "node",
        filePath: payload.filePath || "",
      });

      if (payload.filePath) {
        const fileNode = fileNodeLookup.get(payload.filePath);
        if (fileNode) {
          onNodeClick?.(fileNode);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fileNodeLookup, onNodeClick]);

  if (codegraph) {
    return (
      <section className="overflow-hidden rounded-[24px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-primary">Code Graph</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">
                {isFallbackGraph ? "Repository map" : "Interactive code graph"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">
                {isFallbackGraph
                  ? "Rendered from GitNexus file, symbol, and cluster data for repos without upstream Python artifacts."
                  : "Search, zoom, drag, and inspect the repository as a live system map."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <StatCard icon={Boxes} label="Modules" value={`${codegraph.stats.moduleCount}`} />
              <StatCard icon={Sparkles} label="Entities" value={`${codegraph.stats.entityCount}`} />
              <StatCard icon={Network} label="Links" value={`${codegraph.stats.linkCount}`} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    downloadText(
                      "codegraph.json",
                      JSON.stringify(codegraph, null, 2),
                      "application/json"
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  JSON
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    downloadText(
                      "codegraph.csv",
                      serializeCsv(codegraph.csvRows),
                      "text/csv"
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {selectedNode ? (
              <div className="rounded-full bg-white/[0.05] px-4 py-2 text-sm text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <span className="font-semibold text-white">{selectedNode.label}</span>
                <span className="mx-2 text-white/28">·</span>
                <span>{selectedNode.nodeType}</span>
                {selectedNode.filePath ? (
                  <>
                    <span className="mx-2 text-white/28">·</span>
                    <span className="font-mono text-xs">{selectedNode.filePath}</span>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="rounded-full bg-white/[0.05] px-4 py-2 text-sm text-white/56 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                Click a node inside the graph to sync it back to Studio.
              </div>
            )}

            {activeFilePath ? (
              <div className="rounded-full bg-white/[0.04] px-4 py-2 text-sm text-white/56 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                Active file: <span className="font-mono text-xs">{activeFilePath}</span>
              </div>
            ) : null}
            {isFallbackGraph ? (
              <div className="rounded-full bg-amber-300/10 px-4 py-2 text-sm text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.14)]">
                Fallback graph built from GitNexus data
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-6">
          <div className="overflow-hidden rounded-[22px] bg-[#091223] ring-1 ring-[rgba(126,138,166,0.14)] shadow-[0_30px_90px_rgba(6,12,26,0.32)]">
            <iframe
              title="Interactive codegraph"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin"
              className="h-[960px] w-full border-0"
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-white/48">
            <FileCode2 className="h-4 w-4" />
            Search with <span className="font-mono text-xs">Ctrl+F</span>, drag nodes to compare paths, and collapse noisy branches as needed.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
      <div className="px-6 py-5">
        <div className="text-sm font-semibold text-primary">Code Graph</div>
        <h2 className="mt-1 text-2xl font-semibold text-white">
          Repository map
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">
          The upstream interactive graph is only available when Python codegraph
          data exists for the current repo.
        </p>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-3">
        <StatCard icon={Boxes} label="Nodes" value={`${graphData.nodes.length}`} />
        <StatCard icon={Network} label="Edges" value={`${graphData.edges.length}`} />
        <StatCard icon={Sparkles} label="Clusters" value={`${graphData.clusters.length}`} />
      </div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/36">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
