/**
 * src/lib/codeGraph.ts
 *
 * Code Graph RAG — Intelligence Layer
 * Processes enhanced graph data to extract insights for Gemini prompts,
 * file importance ranking, and architecture narrative generation.
 */

import type { GitNexusGraphData, GitNexusNode } from './types';

// ---------------------------------------------------------------------------
// Graph Importance & Ranking
// ---------------------------------------------------------------------------

interface GraphImportanceResult {
    files: string[];
    symbols?: string[];
}

/**
 * Rank files by combined in-degree + complexity + export count.
 * Files with high scores are architecturally critical hub files.
 */
export function getImportantFiles(graph: GitNexusGraphData | null): GraphImportanceResult {
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
        return { files: [] };
    }

    // Use hub files from summary if available (pre-computed by server)
    if (graph.summary?.hubFiles && graph.summary.hubFiles.length > 0) {
        const topSymbols = graph.nodes
            .filter(n => n.kind !== 'File' && (n.complexity ?? 0) > 0)
            .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
            .slice(0, 10)
            .map(n => n.name);

        return {
            files: graph.summary.hubFiles.slice(0, 15),
            symbols: topSymbols,
        };
    }

    // Fallback: compute in-degree manually
    const inDegree = new Map<string, number>();
    for (const edge of (graph.edges || [])) {
        if (edge.type === 'IMPORTS') {
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        }
    }

    const fileScores = new Map<string, number>();
    for (const node of graph.nodes) {
        if (node.kind === 'File' && node.filePath) {
            const deg = inDegree.get(node.id) || 0;
            const complexity = node.lineCount ? Math.min(node.lineCount / 50, 5) : 0;
            const isEntry = node.isEntryPoint ? 3 : 0;
            fileScores.set(node.filePath, deg + complexity + isEntry);
        }
    }

    const sorted = [...fileScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([p]) => p);

    const topSymbols = graph.nodes
        .filter(n => n.kind !== 'File')
        .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
        .slice(0, 10)
        .map(n => n.name);

    return {
        files: sorted.slice(0, 15),
        symbols: topSymbols,
    };
}

// ---------------------------------------------------------------------------
// Architecture Narrative (NEW — structured digest for Gemini)
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive architecture narrative from the graph.
 * This is the primary context block sent to Gemini for manifest generation.
 */
export function getArchitectureNarrative(graph: GitNexusGraphData | null): string {
    if (!graph) return '';

    const sections: string[] = [];
    const s = graph.summary;

    // ── Overview ──────────────────────────────────────────────────────────────
    if (s) {
        sections.push('=== REPOSITORY OVERVIEW ===');
        if (s.repoName) sections.push(`Repository: ${s.repoName}`);
        if (s.architecturePattern) sections.push(`Architecture: ${s.architecturePattern}`);
        sections.push(`Files: ${s.totalFiles} | Symbols: ${s.totalSymbols} | Relationships: ${s.totalEdges}`);

        if (s.languages && Object.keys(s.languages).length > 0) {
            const langStr = Object.entries(s.languages)
                .sort((a, b) => b[1] - a[1])
                .map(([lang, count]) => `${lang} (${count})`)
                .join(', ');
            sections.push(`Languages: ${langStr}`);
        }

        if (s.keyTechnologies && s.keyTechnologies.length > 0) {
            sections.push(`Tech Stack: ${s.keyTechnologies.join(', ')}`);
        }

        if (s.readmeSummary) {
            sections.push(`\nREADME Summary:\n${s.readmeSummary.substring(0, 400)}`);
        }
    }

    // ── Entry Points ──────────────────────────────────────────────────────────
    if (s?.entryPoints && s.entryPoints.length > 0) {
        sections.push('\n=== ENTRY POINTS ===');
        for (const ep of s.entryPoints.slice(0, 5)) {
            const node = graph.nodes.find(n => n.id === ep);
            const syms = graph.nodes
                .filter(n => n.filePath === ep && n.kind !== 'File')
                .slice(0, 3)
                .map(n => `${n.kind}: ${n.name}`)
                .join(', ');
            sections.push(`  → ${ep}${syms ? ` (exports: ${syms})` : ''}`);
        }
    }

    // ── Hub Files (most depended on) ──────────────────────────────────────────
    if (s?.hubFiles && s.hubFiles.length > 0) {
        sections.push('\n=== HUB FILES (most imported) ===');
        for (const hf of s.hubFiles.slice(0, 6)) {
            const node = graph.nodes.find(n => n.id === hf);
            const topSymbol = graph.nodes
                .filter(n => n.filePath === hf && n.kind !== 'File')
                .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
                .slice(0, 1)[0];
            let desc = `  ★ ${hf}`;
            if (topSymbol?.docstring) desc += ` — ${topSymbol.docstring.substring(0, 80)}`;
            sections.push(desc);
            if (topSymbol?.codeSnippet) {
                sections.push(`    \`\`\`\n${topSymbol.codeSnippet.split('\n').slice(0, 5).map(l => '    ' + l).join('\n')}\n    \`\`\``);
            }
        }
    }

    // ── Module Clusters ───────────────────────────────────────────────────────
    if (graph.clusters && graph.clusters.length > 0) {
        sections.push('\n=== MODULE CLUSTERS ===');
        for (const cluster of graph.clusters.slice(0, 8)) {
            const desc = cluster.description || `${cluster.label} (${cluster.members.length} files)`;
            sections.push(`  [${cluster.kind || 'module'}] ${cluster.label}: ${desc}`);
        }
    }

    // ── Execution Flows ───────────────────────────────────────────────────────
    if (graph.processes && graph.processes.length > 0) {
        sections.push('\n=== EXECUTION FLOWS ===');
        for (const proc of graph.processes.slice(0, 4)) {
            const stepStr = proc.steps
                .map(s => `${s.symbolName} (${s.filePath.split('/').pop()})`)
                .join(' → ');
            sections.push(`  ▸ ${proc.name}: ${stepStr}`);
            if (proc.description) sections.push(`    ${proc.description}`);
        }
    }

    // ── Key Symbols with Docstrings ───────────────────────────────────────────
    const keySymbols = graph.nodes
        .filter(n => n.kind !== 'File' && n.docstring)
        .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
        .slice(0, 8);

    if (keySymbols.length > 0) {
        sections.push('\n=== KEY SYMBOLS ===');
        for (const sym of keySymbols) {
            sections.push(`  ${sym.kind} ${sym.name} (${sym.filePath.split('/').pop()}): ${sym.docstring?.substring(0, 120)}`);
        }
    }

    return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Graph Hints for Gemini (backward-compatible + enhanced)
// ---------------------------------------------------------------------------

/**
 * Build a prompt hints string from the enhanced graph data.
 * This is kept for backward compatibility but now leverages richer data.
 */
export function getGraphHintsForGemini(
    graph: GitNexusGraphData | null,
    _fileContents: Record<string, string>
): string {
    if (!graph) return '';

    // Prefer the full architecture narrative
    const narrative = getArchitectureNarrative(graph);
    if (narrative) return '\nCODE GRAPH RAG ANALYSIS:\n' + narrative;

    // Fallback: basic hints
    const hints: string[] = [];

    if (graph.clusters && graph.clusters.length > 0) {
        hints.push('MODULE CLUSTERS:');
        for (const cluster of graph.clusters.slice(0, 8)) {
            const memberPaths = cluster.members.slice(0, 5);
            hints.push(`  • ${cluster.label} (${cluster.members.length} members): ${memberPaths.join(', ')}`);
        }
    }

    if (graph.processes && graph.processes.length > 0) {
        hints.push('\nDATA FLOWS:');
        for (const proc of graph.processes.slice(0, 5)) {
            const stepNames = proc.steps.map(s => `${s.symbolName} (${s.filePath})`);
            hints.push(`  • ${proc.name}: ${stepNames.join(' → ')}`);
        }
    }

    const edgeTypeCounts = new Map<string, number>();
    for (const edge of (graph.edges || [])) {
        edgeTypeCounts.set(edge.type, (edgeTypeCounts.get(edge.type) || 0) + 1);
    }
    if (edgeTypeCounts.size > 0) {
        hints.push('\nRELATIONSHIP SUMMARY:');
        for (const [type, count] of edgeTypeCounts) {
            hints.push(`  • ${type}: ${count} relationships`);
        }
    }

    return hints.length > 0
        ? '\nCODE GRAPH INSIGHTS:\n' + hints.join('\n')
        : '';
}

// ---------------------------------------------------------------------------
// File content extraction
// ---------------------------------------------------------------------------

export function extractFileContentFromString(fullContent: string, targetPath: string): string | null {
    if (!fullContent || !targetPath) return null;

    const normalizedTarget = targetPath.replace(/^\//, '');
    const patterns = [
        new RegExp(`={10,}\\s*\\n\\s*File:\\s*${normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n={10,}`, 'i'),
        new RegExp(`-{5,}\\s*FILE:\\s*${normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-{5,}`, 'i'),
    ];

    for (const pattern of patterns) {
        const match = fullContent.match(pattern);
        if (match && match.index !== undefined) {
            const startIdx = match.index + match[0].length;
            const nextFileMatch = fullContent.substring(startIdx).search(/(?:={10,}\s*\nFile:|-{5,}\s*FILE:)/i);
            const endIdx = nextFileMatch !== -1 ? startIdx + nextFileMatch : fullContent.length;
            return fullContent.substring(startIdx, endIdx).trim();
        }
    }

    return null;
}
