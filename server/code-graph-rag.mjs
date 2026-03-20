/**
 * Code Graph RAG — Enhanced Code Intelligence Graph Builder
 * 
 * Extracts rich metadata: docstrings, code snippets, complexity, call graphs,
 * extends/implements edges, architecture patterns, tech stack detection.
 * Runs in <200 ms — no subprocess, no npx, zero external dependencies.
 * 
 * Usage:
 *   import { buildCodeGraph } from './code-graph-rag.mjs';
 *   const graphData = buildCodeGraph(chunks);
 */

import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Chunk Parser
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the file path + content from the raw chunks that walkAndRead produces. */
function parseChunksToFiles(chunks) {
    const files = [];
    for (const chunk of chunks) {
        const m = chunk.match(/^[\s\S]*?----- FILE: (.+?) -----\n([\s\S]*)$/);
        if (m) files.push({ filePath: m[1], content: m[2] });
    }
    return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolveImport(specifier, importerPath, knownFiles) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('@/')) {
        const normalized = specifier.replace(/\\/g, '/').replace(/^\/+/, '');
        if (normalized.includes('/')) {
            const suffixes = [];
            const parts = normalized.split('/').filter(Boolean);
            for (let i = 0; i < parts.length; i++) {
                const suffix = parts.slice(i).join('/');
                suffixes.push(`${suffix}.php`);
                suffixes.push(`src/${suffix}.php`);
            }
            for (const candidate of suffixes) {
                if (knownFiles.has(candidate)) return candidate;
            }
            const base = parts[parts.length - 1];
            const basenameMatches = [...knownFiles].filter((filePath) => path.basename(filePath, path.extname(filePath)) === base);
            if (basenameMatches.length === 1) return basenameMatches[0];
        }
        return null;
    }
    let candidate = specifier;
    if (candidate.startsWith('@/')) {
        candidate = candidate.slice(2);
    } else {
        const importerDir = path.dirname(importerPath);
        candidate = path.join(importerDir, candidate);
    }
    candidate = candidate.replace(/\\/g, '/');
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.vue', '.svelte', '.php', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.php'];
    for (const ext of extensions) {
        const full = candidate + ext;
        if (knownFiles.has(full)) return full;
    }
    return null;
}

function extractImports(content, ext) {
    const imports = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;

        let m = trimmed.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
        if (m) { imports.push(m[1]); continue; }

        m = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
        if (m) { imports.push(m[1]); continue; }

        m = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (m) { imports.push(m[1]); continue; }

        m = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (m) { imports.push(m[1]); continue; }

        if (['.py'].includes(ext)) {
            m = trimmed.match(/^from\s+([\w.]+)\s+import/);
            if (m) { imports.push(m[1].replace(/\./g, '/')); continue; }
            m = trimmed.match(/^import\s+([\w.]+)/);
            if (m) { imports.push(m[1].replace(/\./g, '/')); continue; }
        }

        if (['.go'].includes(ext)) {
            m = trimmed.match(/^\s*"([^"]+)"/);
            if (m) { imports.push(m[1]); continue; }
        }

        if (['.php'].includes(ext)) {
            m = trimmed.match(/^use\s+(.+);$/i);
            if (m) {
                const clause = m[1].trim().replace(/^function\s+/i, '').replace(/^const\s+/i, '');
                const grouped = clause.match(/^([^{}]+)\{([^}]+)\}$/);
                if (grouped) {
                    const prefix = grouped[1].trim().replace(/\\+$/, '');
                    const members = grouped[2]
                        .split(',')
                        .map((part) => part.trim().split(/\s+as\s+/i)[0].trim())
                        .filter(Boolean);
                    for (const member of members) {
                        imports.push(`${prefix}\\${member}`);
                    }
                } else {
                    imports.push(clause.split(/\s+as\s+/i)[0].trim());
                }
                continue;
            }

            m = trimmed.match(/(?:require|require_once|include|include_once)\s*(?:\(\s*)?['"]([^'"]+)['"](?:\s*\))?/i);
            if (m) { imports.push(m[1]); continue; }
        }
    }

    return imports;
}

// ─────────────────────────────────────────────────────────────────────────────
// Language & Tagging
// ─────────────────────────────────────────────────────────────────────────────

const EXT_TO_LANG = {
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby',
    '.php': 'PHP', '.java': 'Java', '.c': 'C', '.cpp': 'C++', '.h': 'C',
    '.hpp': 'C++', '.cs': 'C#', '.swift': 'Swift', '.kt': 'Kotlin',
    '.vue': 'Vue', '.svelte': 'Svelte',
    '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
    '.md': 'Markdown', '.mdx': 'MDX',
    '.sql': 'SQL', '.graphql': 'GraphQL', '.gql': 'GraphQL',
    '.sh': 'Shell', '.bash': 'Shell',
};

function autoTagFile(filePath) {
    const tags = [];
    const lc = filePath.toLowerCase();
    if (/\/(api|routes?|handlers?|controllers?|endpoints?)\//i.test(lc) || /\.(route|controller|handler)\./i.test(lc)) tags.push('api');
    if (/\/(components?|pages?|views?|screens?|ui|widgets?)\//i.test(lc) || /\.(component|page|screen)\./i.test(lc)) tags.push('ui');
    if (/\/(models?|schemas?|entities?|types?|database|db|migrations?|prisma)\//i.test(lc) || /\.(model|schema|entity)\./i.test(lc)) tags.push('data');
    if (/\/(utils?|helpers?|lib|shared|common)\//i.test(lc)) tags.push('util');
    if (/\/(config|settings?|env)\//i.test(lc) || /\.(config|conf)\./i.test(lc) || /^\.env/i.test(path.basename(lc))) tags.push('config');
    if (
        /\/(tests?|__tests?__|spec|e2e|cypress|jest)\//i.test(lc) ||
        /(?:^|\/)(?:test_.*|.*(?:_test|_spec)|.*\.(?:test|spec|e2e))\.[^.\/]+$/i.test(lc)
    ) tags.push('test');
    if (/\/(hooks?|composables?)\//i.test(lc) || /^use[A-Z]/i.test(path.basename(lc))) tags.push('hooks');
    if (/\/(middleware|interceptors?)\//i.test(lc)) tags.push('middleware');
    if (/\/(services?|providers?)\//i.test(lc)) tags.push('service');
    if (/\/(auth|authentication|authorization)\//i.test(lc)) tags.push('auth');
    if (/\/(styles?|css|theme)\//i.test(lc)) tags.push('styles');
    if (/\/(store|redux|state|context)\//i.test(lc)) tags.push('state');
    return tags;
}

function isDocLikeFile(filePath) {
    return /(^|\/)(readme|docs?|contributing|code_of_conduct|license|changelog)(\/|\.|$)/i.test(filePath);
}

function isConfigLikeFile(filePath) {
    return /(^|\/)(package(-lock)?\.json|pnpm-lock|yarn\.lock|bun\.lock|tsconfig|eslint|prettier|vite\.config|tailwind\.config|docker|render\.yaml|netlify|vercel|\.github)(\/|\.|$)/i.test(filePath);
}

function isBuildLikeFile(filePath) {
    return /(^|\/)(dist|build|out|coverage|public|static)(\/|$)/i.test(filePath);
}

function isNoiseForArchitecture(filePath) {
    const tags = autoTagFile(filePath);
    return tags.includes('test') || isDocLikeFile(filePath) || isConfigLikeFile(filePath) || isBuildLikeFile(filePath);
}

function isPreferredArchitectureFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const codeExts = new Set([
        '.js', '.jsx', '.mjs', '.ts', '.tsx', '.py', '.go', '.rs', '.rb', '.php',
        '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt', '.vue', '.svelte'
    ]);
    return codeExts.has(ext) && !isNoiseForArchitecture(filePath);
}

function scoreEntryCandidate(file, fileSymbolsMap, outImportCount, fileInDegree) {
    const tags = autoTagFile(file.filePath);
    const lc = file.filePath.toLowerCase();
    let score = 0;

    if (isPreferredArchitectureFile(file.filePath)) score += 42;
    if (/\/(src|app|lib|server)\//i.test(lc)) score += 16;
    if (/(^|\/)(main|app|server|start|bootstrap|entry|client)\.[^/]+$/i.test(lc)) score += 42;
    else if (/(^|\/)index\.[^/]+$/i.test(lc)) score += 24;
    else if (/(^|\/)autoload\.[^/]+$/i.test(lc)) score += 16;
    if (/\/(pages?|views?|screens?|routes?|controllers?)\//i.test(lc)) score += 16;
    if (/\/(components?|ui)\//i.test(lc)) score += 6;
    if (tags.includes('api') || tags.includes('ui') || tags.includes('service') || tags.includes('data') || tags.includes('state')) score += 12;
    if (tags.includes('util') || tags.includes('hooks') || tags.includes('middleware')) score += 6;
    if (tags.includes('util')) score -= 12;
    if (/\/lib\//i.test(lc)) score -= 10;
    if (/\/data\//i.test(lc)) score -= 6;

    score += Math.min(14, (outImportCount.get(file.filePath) || 0) * 2);
    score += Math.min(10, fileSymbolsMap.get(file.filePath)?.length || 0);
    score += Math.min(8, fileInDegree.get(file.filePath) || 0);

    if (tags.includes('test')) score -= 60;
    if (tags.includes('config')) score -= 28;
    if (isDocLikeFile(file.filePath)) score -= 34;
    if (isConfigLikeFile(file.filePath)) score -= 30;
    if (isBuildLikeFile(file.filePath)) score -= 26;

    return score;
}

function scoreHubFile(file, fileInDegree, fileSymbolsMap) {
    const tags = autoTagFile(file.filePath);
    let score = (fileInDegree.get(file.filePath) || 0) * 5;
    score += Math.min(10, fileSymbolsMap.get(file.filePath)?.length || 0);
    if (isPreferredArchitectureFile(file.filePath)) score += 20;
    if (tags.includes('api') || tags.includes('ui') || tags.includes('service') || tags.includes('data') || tags.includes('state')) score += 8;
    if (isNoiseForArchitecture(file.filePath)) score -= 30;
    return score;
}

function scoreProcessStep(filePath, fileInDegree) {
    const tags = autoTagFile(filePath);
    let score = 0;
    if (isPreferredArchitectureFile(filePath)) score += 24;
    if (tags.includes('api') || tags.includes('ui') || tags.includes('service') || tags.includes('data') || tags.includes('state')) score += 8;
    if (tags.includes('util') || tags.includes('hooks') || tags.includes('middleware')) score += 4;
    score += Math.min(8, fileInDegree.get(filePath) || 0);
    if (isNoiseForArchitecture(filePath)) score -= 28;
    return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol Extraction (Enhanced)
// ─────────────────────────────────────────────────────────────────────────────

function extractDocstring(lines, symbolLine) {
    const idx = symbolLine - 1;
    if (idx <= 0) return null;

    const collected = [];
    let i = idx - 1;

    while (i >= 0 && lines[i].trim() === '') i--;

    if (i >= 0) {
        const trimmed = lines[i].trim();
        if (trimmed.endsWith('*/')) {
            while (i >= 0) {
                collected.unshift(lines[i].trim());
                if (lines[i].trim().startsWith('/**') || lines[i].trim().startsWith('/*')) break;
                i--;
            }
            const raw = collected.join('\n')
                .replace(/^\/\*\*?\s*/m, '')
                .replace(/\s*\*\/$/m, '')
                .replace(/^\s*\*\s?/gm, '')
                .trim();
            return raw.substring(0, 300) || null;
        }
        if (idx < lines.length - 1) {
            if (idx + 1 < lines.length) {
                const docLine = lines[idx + 1]?.trim();
                if (docLine && (docLine.startsWith('"""') || docLine.startsWith("'''"))) {
                    const quote = docLine.substring(0, 3);
                    if (docLine.endsWith(quote) && docLine.length > 6) {
                        return docLine.slice(3, -3).trim().substring(0, 300) || null;
                    }
                    const docParts = [docLine.slice(3)];
                    for (let j = idx + 2; j < Math.min(idx + 10, lines.length); j++) {
                        if (lines[j].trim().endsWith(quote)) {
                            docParts.push(lines[j].trim().slice(0, -3));
                            break;
                        }
                        docParts.push(lines[j].trim());
                    }
                    return docParts.join(' ').trim().substring(0, 300) || null;
                }
            }
        }
        if (trimmed.startsWith('//')) {
            while (i >= 0 && lines[i].trim().startsWith('//')) {
                collected.unshift(lines[i].trim().replace(/^\/\/\s?/, ''));
                i--;
            }
            return collected.join(' ').trim().substring(0, 300) || null;
        }
        if (trimmed.startsWith('#') && !trimmed.startsWith('#!')) {
            while (i >= 0 && lines[i].trim().startsWith('#')) {
                collected.unshift(lines[i].trim().replace(/^#\s?/, ''));
                i--;
            }
            return collected.join(' ').trim().substring(0, 300) || null;
        }
    }
    return null;
}

function extractCodeSnippet(lines, startLine, maxLines = 10) {
    const start = startLine - 1;
    if (start < 0 || start >= lines.length) return '';
    const end = Math.min(start + maxLines, lines.length);
    return lines.slice(start, end).join('\n');
}

function estimateComplexity(content) {
    const branches = (content.match(/\b(if|else\s+if|switch|case|for|while|do|catch|&&|\|\||\?[^?]*:)/g) || []).length;
    return Math.min(branches, 100);
}

function detectExportType(line) {
    const t = line.trim();
    if (t.startsWith('export default ')) return 'default';
    if (t.startsWith('export ')) return 'named';
    return 'none';
}

function extractSymbolsEnhanced(content, ext) {
    const symbols = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let m;
        let sym = null;

        if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
            m = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/);
            if (m) { sym = { name: m[1], kind: 'Function', line: i + 1 }; }

            if (!sym) { m = line.match(/^(?:export\s+)?(?:default\s+)?class\s+(\w+)/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Class', line: i + 1 }; }

            if (!sym) { m = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/); }
            if (!sym && m) {
                const n = m[1];
                let kind = 'Function';
                if (/^use[A-Z]/.test(n)) kind = 'Hook';
                else if (/^[A-Z]/.test(n)) kind = 'Component';
                sym = { name: n, kind, line: i + 1 };
            }

            if (!sym) { m = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Function', line: i + 1 }; }

            if (!sym) { m = line.match(/^(?:export\s+)?interface\s+(\w+)/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Interface', line: i + 1 }; }

            if (!sym) { m = line.match(/^(?:export\s+)?type\s+(\w+)\s*=/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Interface', line: i + 1 }; }

            if (!sym) { m = line.match(/^(?:export\s+)?enum\s+(\w+)/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Enum', line: i + 1 }; }
        }

        if (!sym && ['.py'].includes(ext)) {
            m = line.match(/^(?:async\s+)?def\s+(\w+)/);
            if (m) { sym = { name: m[1], kind: 'Function', line: i + 1 }; }
            if (!sym) { m = line.match(/^class\s+(\w+)/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Class', line: i + 1 }; }
        }

        if (!sym && ['.go'].includes(ext)) {
            m = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/);
            if (m) { sym = { name: m[1], kind: 'Function', line: i + 1 }; }
            if (!sym) { m = line.match(/^type\s+(\w+)\s+struct/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Class', line: i + 1 }; }
            if (!sym) { m = line.match(/^type\s+(\w+)\s+interface/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Interface', line: i + 1 }; }
        }

        if (!sym && ['.rs'].includes(ext)) {
            m = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
            if (m) { sym = { name: m[1], kind: 'Function', line: i + 1 }; }
            if (!sym) { m = line.match(/^(?:pub\s+)?struct\s+(\w+)/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Class', line: i + 1 }; }
            if (!sym) { m = line.match(/^(?:pub\s+)?trait\s+(\w+)/); }
            if (!sym && m) { sym = { name: m[1], kind: 'Interface', line: i + 1 }; }
        }

        if (!sym && ['.php'].includes(ext)) {
            m = line.match(/^(?:abstract\s+|final\s+)?class\s+(\w+)/i);
            if (m) { sym = { name: m[1], kind: 'Class', line: i + 1 }; }

            if (!sym) { m = line.match(/^interface\s+(\w+)/i); }
            if (!sym && m) { sym = { name: m[1], kind: 'Interface', line: i + 1 }; }

            if (!sym) { m = line.match(/^trait\s+(\w+)/i); }
            if (!sym && m) { sym = { name: m[1], kind: 'Module', line: i + 1 }; }

            if (!sym) { m = line.match(/^(?:public|protected|private)?\s*function\s+(\w+)/i); }
            if (!sym && m) {
                const kind = /^__/.test(m[1]) ? 'Method' : 'Function';
                sym = { name: m[1], kind, line: i + 1 };
            }
        }

        if (sym) {
            sym.exportType = detectExportType(lines[i]);
            sym.docstring = extractDocstring(lines, sym.line);
            sym.codeSnippet = extractCodeSnippet(lines, sym.line, 10);
            sym.complexity = estimateComplexity(sym.codeSnippet || '');
            symbols.push(sym);
        }
    }

    return symbols;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractInheritance(content, ext) {
    const relations = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        let m;

        if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
            m = trimmed.match(/class\s+(\w+)\s+extends\s+(\w+)/);
            if (m) { relations.push({ child: m[1], parent: m[2], type: 'EXTENDS' }); }

            m = trimmed.match(/class\s+(\w+).*implements\s+([\w,\s]+)/);
            if (m) {
                const ifaces = m[2].split(',').map(s => s.trim()).filter(Boolean);
                for (const iface of ifaces) {
                    relations.push({ child: m[1], parent: iface, type: 'IMPLEMENTS' });
                }
            }
        }

        if (['.py'].includes(ext)) {
            m = trimmed.match(/^class\s+(\w+)\(([^)]+)\)/);
            if (m) {
                const parents = m[2].split(',').map(s => s.trim()).filter(s => s && s !== 'object');
                for (const p of parents) {
                    relations.push({ child: m[1], parent: p, type: 'EXTENDS' });
                }
            }
        }

        if (['.rs'].includes(ext)) {
            m = trimmed.match(/impl\s+(\w+)\s+for\s+(\w+)/);
            if (m) { relations.push({ child: m[2], parent: m[1], type: 'IMPLEMENTS' }); }
        }

        if (['.php'].includes(ext)) {
            m = trimmed.match(/^(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+([\\\w]+))?(?:\s+implements\s+([\\\w,\s]+))?/i);
            if (m) {
                const child = m[1];
                const parent = m[2]?.split('\\').pop();
                if (parent) {
                    relations.push({ child, parent, type: 'EXTENDS' });
                }
                const ifaces = m[3]
                    ? m[3].split(',').map((part) => part.trim().split('\\').pop()).filter(Boolean)
                    : [];
                for (const iface of ifaces) {
                    relations.push({ child, parent: iface, type: 'IMPLEMENTS' });
                }
            }

            m = trimmed.match(/^interface\s+(\w+)\s+extends\s+([\\\w,\s]+)/i);
            if (m) {
                const parents = m[2]
                    .split(',')
                    .map((part) => part.trim().split('\\').pop())
                    .filter(Boolean);
                for (const parent of parents) {
                    relations.push({ child: m[1], parent, type: 'EXTENDS' });
                }
            }
        }
    }

    return relations;
}

function extractCallEdges(content, ext, symbolNames) {
    if (symbolNames.length === 0) return [];
    const calls = [];
    const lines = content.split('\n');
    const namePattern = symbolNames.join('|');
    const callRegex = new RegExp(`\\b(${namePattern})\\s*\\(`, 'g');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\b(function|class|interface|trait)\b/.test(line)) continue;
        let m;
        callRegex.lastIndex = 0;
        while ((m = callRegex.exec(line)) !== null) {
            calls.push({ lineNumber: i + 1, callee: m[1] });
        }
    }

    return calls;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tech Stack & Architecture Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectTechnologies(files) {
    const techs = new Set();
    for (const file of files) {
        const name = path.basename(file.filePath);

        if (name === 'package.json') {
            try {
                const pkg = JSON.parse(file.content);
                const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                const known = {
                    'react': 'React', 'next': 'Next.js', 'vue': 'Vue', 'svelte': 'Svelte',
                    'angular': 'Angular', 'express': 'Express', 'fastify': 'Fastify', 'hono': 'Hono',
                    'prisma': 'Prisma', 'drizzle-orm': 'Drizzle', 'mongoose': 'Mongoose',
                    'tailwindcss': 'TailwindCSS', 'styled-components': 'Styled Components',
                    'graphql': 'GraphQL', 'trpc': 'tRPC', 'socket.io': 'Socket.IO',
                    'supabase': 'Supabase', '@supabase/supabase-js': 'Supabase',
                    'firebase': 'Firebase', 'aws-sdk': 'AWS SDK',
                    'jest': 'Jest', 'vitest': 'Vitest', 'mocha': 'Mocha',
                    'typescript': 'TypeScript', 'vite': 'Vite', 'webpack': 'Webpack',
                    'redux': 'Redux', '@reduxjs/toolkit': 'Redux Toolkit',
                    'zustand': 'Zustand', 'jotai': 'Jotai', 'recoil': 'Recoil',
                    'remotion': 'Remotion', 'three': 'Three.js',
                    'zod': 'Zod', 'yup': 'Yup', 'joi': 'Joi',
                    'stripe': 'Stripe', 'passport': 'Passport',
                };
                for (const dep of Object.keys(allDeps)) {
                    if (known[dep]) techs.add(known[dep]);
                }
                if (pkg.scripts) {
                    const allScripts = Object.values(pkg.scripts).join(' ');
                    if (allScripts.includes('next')) techs.add('Next.js');
                    if (allScripts.includes('vite')) techs.add('Vite');
                    if (allScripts.includes('webpack')) techs.add('Webpack');
                }
            } catch { /* ignore parse errors */ }
        }

        if (name === 'requirements.txt' || name === 'Pipfile' || name === 'pyproject.toml') {
            const lc = file.content.toLowerCase();
            if (lc.includes('django')) techs.add('Django');
            if (lc.includes('flask')) techs.add('Flask');
            if (lc.includes('fastapi')) techs.add('FastAPI');
            if (lc.includes('sqlalchemy')) techs.add('SQLAlchemy');
            if (lc.includes('pytorch') || lc.includes('torch')) techs.add('PyTorch');
            if (lc.includes('tensorflow')) techs.add('TensorFlow');
            if (lc.includes('pandas')) techs.add('Pandas');
            if (lc.includes('numpy')) techs.add('NumPy');
        }

        if (name === 'go.mod') {
            if (file.content.includes('gin-gonic')) techs.add('Gin');
            if (file.content.includes('echo')) techs.add('Echo');
            if (file.content.includes('fiber')) techs.add('Fiber');
        }

        if (name === 'Cargo.toml') {
            if (file.content.includes('actix')) techs.add('Actix');
            if (file.content.includes('tokio')) techs.add('Tokio');
            if (file.content.includes('serde')) techs.add('Serde');
        }
    }
    return [...techs];
}

function detectArchitecturePattern(files) {
    const dirs = new Set();
    for (const f of files) {
        const parts = f.filePath.split('/');
        for (let i = 0; i < parts.length - 1; i++) {
            dirs.add(parts[i].toLowerCase());
        }
    }

    if ((dirs.has('models') || dirs.has('model')) && (dirs.has('views') || dirs.has('view') || dirs.has('templates')) && (dirs.has('controllers') || dirs.has('controller'))) return 'MVC';
    if (dirs.has('components') && (dirs.has('pages') || dirs.has('app'))) return 'Component-based SPA';
    if (dirs.has('services') && dirs.has('gateway')) return 'Microservices';
    if (dirs.has('domain') && dirs.has('infrastructure') && dirs.has('application')) return 'Clean Architecture';
    if (dirs.has('ports') && dirs.has('adapters')) return 'Hexagonal Architecture';
    if (dirs.has('routes') || dirs.has('handlers') || dirs.has('endpoints')) {
        if (dirs.has('middleware')) return 'REST API Server';
        return 'API Server';
    }
    if (dirs.has('packages') || dirs.has('apps')) return 'Monorepo';
    if (dirs.has('src') && dirs.has('lib')) return 'Library / Package';
    if (dirs.has('src')) return 'Standard Project';
    return 'Flat Structure';
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Classification
// ─────────────────────────────────────────────────────────────────────────────

function classifyCluster(dir) {
    const lc = dir.toLowerCase();
    const leaf = lc.split('/').pop() || lc;
    if (/^(api|routes?|handlers?|controllers?|endpoints?)$/.test(leaf)) return 'api';
    if (/^(components?|pages?|views?|screens?|ui|widgets?)$/.test(leaf)) return 'ui';
    if (/^(models?|schemas?|entities?|database|db|prisma|migrations?)$/.test(leaf)) return 'data';
    if (/^(utils?|helpers?|lib|shared|common)$/.test(leaf)) return 'util';
    if (/^(config|settings?)$/.test(leaf)) return 'config';
    if (/^(tests?|__tests?__|spec|e2e)$/.test(leaf)) return 'test';
    if (/^(hooks?|composables?)$/.test(leaf)) return 'hooks';
    if (/^(middleware|interceptors?)$/.test(leaf)) return 'middleware';
    if (/^(services?|providers?)$/.test(leaf)) return 'service';
    if (/^(store|redux|state|context)$/.test(leaf)) return 'state';
    if (/^(styles?|css|theme)$/.test(leaf)) return 'styles';
    if (/^(auth|authentication)$/.test(leaf)) return 'auth';
    if (/^(assets?|images?|icons?|fonts?)$/.test(leaf)) return 'assets';
    if (/^(scripts?|bin|tools?)$/.test(leaf)) return 'tooling';
    if (/^(docs?|documentation)$/.test(leaf)) return 'docs';
    if (/^(public|static|dist|build|out)$/.test(leaf)) return 'build';
    if (/^src$/.test(leaf)) return 'source';
    if (/^server$/.test(leaf)) return 'server';
    return 'module';
}

function describeCluster(kind, label, memberCount) {
    const descriptions = {
        api: `API layer with ${memberCount} endpoint/route files`,
        ui: `UI components and views (${memberCount} files)`,
        data: `Data models and schema definitions (${memberCount} files)`,
        util: `Shared utilities and helper functions (${memberCount} files)`,
        config: `Configuration and environment settings (${memberCount} files)`,
        test: `Test suites and specifications (${memberCount} files)`,
        hooks: `Custom hooks and composables (${memberCount} files)`,
        middleware: `Middleware and request interceptors (${memberCount} files)`,
        service: `Business logic services (${memberCount} files)`,
        state: `State management layer (${memberCount} files)`,
        styles: `Styling and theme files (${memberCount} files)`,
        auth: `Authentication and authorization (${memberCount} files)`,
        assets: `Static assets (${memberCount} files)`,
        tooling: `Build scripts and dev tools (${memberCount} files)`,
        docs: `Documentation (${memberCount} files)`,
        build: `Build output and public assets (${memberCount} files)`,
        source: `Main source code (${memberCount} files)`,
        server: `Server-side code (${memberCount} files)`,
        module: `${label} module (${memberCount} files)`,
    };
    return descriptions[kind] || `${label} (${memberCount} files)`;
}

function getClusterKey(filePath) {
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length <= 1) return '(root)';
    const first = parts[0].toLowerCase();
    if (['src', 'lib', 'app', 'server', 'tests', 'test'].includes(first) && parts.length >= 3) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Graph Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full enhanced code graph from file chunks.
 * @param {string[]} chunks - Array of raw file chunks from walkAndRead
 * @returns {{ nodes, edges, clusters, processes, summary } | null}
 */
export function buildCodeGraph(chunks) {
    const files = parseChunksToFiles(chunks);
    if (files.length === 0) return null;

    const knownFiles = new Set(files.map(f => f.filePath));
    const nodes = [];
    const edges = [];
    const fileSymbolsMap = new Map();
    const languageCounts = {};
    let readmeSummary = null;

    for (const file of files) {
        const ext = path.extname(file.filePath).toLowerCase();
        const lineCount = file.content.split('\n').length;
        const lang = EXT_TO_LANG[ext] || 'Other';
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;

        if (/readme/i.test(path.basename(file.filePath)) && !readmeSummary) {
            readmeSummary = file.content.substring(0, 600).replace(/^#+\s*/gm, '').trim();
        }

        const tags = autoTagFile(file.filePath);
        const isTestFile = tags.includes('test');
        const isEntryCandidate = /(^|\/)(?:index|main|app|server|start)\.[^/]+$/i.test(file.filePath);

        nodes.push({
            id: file.filePath,
            name: path.basename(file.filePath),
            kind: 'File',
            filePath: file.filePath,
            startLine: 1,
            endLine: lineCount,
            lineCount,
            language: lang,
            isEntryPoint: isEntryCandidate,
            isTestFile,
            tags,
        });

        const symbols = extractSymbolsEnhanced(file.content, ext);
        fileSymbolsMap.set(file.filePath, symbols);

        const symbolNames = symbols.map(s => s.name);

        for (const sym of symbols) {
            const symId = `${file.filePath}::${sym.name}`;
            nodes.push({
                id: symId,
                name: sym.name,
                kind: sym.kind,
                filePath: file.filePath,
                startLine: sym.line,
                docstring: sym.docstring || undefined,
                codeSnippet: sym.codeSnippet || undefined,
                complexity: sym.complexity || 0,
                exportType: sym.exportType || 'none',
                language: lang,
            });
            edges.push({ source: symId, target: file.filePath, type: 'DEFINED_IN', confidence: 1.0 });
        }

        // Import edges
        const importSpecifiers = extractImports(file.content, ext);
        for (const spec of importSpecifiers) {
            const resolved = resolveImport(spec, file.filePath, knownFiles);
            if (resolved && resolved !== file.filePath) {
                edges.push({ source: file.filePath, target: resolved, type: 'IMPORTS', confidence: 0.9 });
            }
        }

        // Inheritance edges
        const inheritance = extractInheritance(file.content, ext);
        for (const rel of inheritance) {
            const childId = `${file.filePath}::${rel.child}`;
            let parentId = `${file.filePath}::${rel.parent}`;
            const parentExists = nodes.some(n => n.id === parentId);
            if (!parentExists) {
                const globalParent = nodes.find(n => n.name === rel.parent && (n.kind === 'Class' || n.kind === 'Interface'));
                if (globalParent) parentId = globalParent.id;
            }
            edges.push({
                source: childId, target: parentId, type: rel.type,
                confidence: 0.85, label: `${rel.type.toLowerCase()} ${rel.parent}`,
            });
        }

        // Intra-file call edges
        if (symbolNames.length > 1) {
            const callData = extractCallEdges(file.content, ext, symbolNames);
            for (const call of callData) {
                let callerSym = null;
                for (const sym of symbols) {
                    if (sym.line <= call.lineNumber) callerSym = sym;
                    else break;
                }
                if (callerSym && callerSym.name !== call.callee) {
                    const callerId = `${file.filePath}::${callerSym.name}`;
                    const calleeId = `${file.filePath}::${call.callee}`;
                    const exists = edges.some(e => e.source === callerId && e.target === calleeId && e.type === 'CALLS');
                    if (!exists) {
                        edges.push({ source: callerId, target: calleeId, type: 'CALLS', confidence: 0.7 });
                    }
                }
            }
        }

        // Test → tested module edge
        if (isTestFile) {
            const baseName = path.basename(file.filePath)
                .replace(/\.(test|spec|e2e)\./i, '.')
                .replace(/(?:_test|_spec)(\.[^.]+)$/i, '$1')
                .replace(/^(test_)(.+)$/i, '$2');
            const testDir = path.dirname(file.filePath);
            const candidates = [
                path.join(testDir, baseName),
                path.join(testDir, '..', baseName),
                path.join(testDir, '..', 'src', baseName),
            ].map(p => p.replace(/\\/g, '/'));
            for (const c of candidates) {
                if (knownFiles.has(c)) {
                    edges.push({ source: file.filePath, target: c, type: 'TESTS', confidence: 0.8 });
                    break;
                }
            }
        }
    }

    // ── Clustering ──────────────────────────────────────────────────────────────
    const dirGroups = new Map();
    const dirLineCounts = new Map();
    for (const file of files) {
        const dir = getClusterKey(file.filePath);
        if (!dirGroups.has(dir)) { dirGroups.set(dir, []); dirLineCounts.set(dir, 0); }
        dirGroups.get(dir).push(file.filePath);
        dirLineCounts.set(dir, dirLineCounts.get(dir) + file.content.split('\n').length);
    }

    const clusters = [];
    let clusterIdx = 0;
    for (const [dir, members] of dirGroups) {
        if (members.length < 1) continue;
        const kind = classifyCluster(dir);
        clusters.push({
            id: `cluster_${clusterIdx}`, label: dir, members, kind,
            description: describeCluster(kind, dir, members.length),
            fileCount: members.length, totalLines: dirLineCounts.get(dir) || 0,
        });
        clusterIdx++;
    }

    // ── In-degree / hub detection ───────────────────────────────────────────────
    const importedBy = new Map();
    const fileInDegree = new Map();
    const outImportCount = new Map();
    for (const e of edges) {
        if (e.type === 'IMPORTS') {
            if (!importedBy.has(e.target)) importedBy.set(e.target, new Set());
            importedBy.get(e.target).add(e.source);
            fileInDegree.set(e.target, (fileInDegree.get(e.target) || 0) + 1);
            outImportCount.set(e.source, (outImportCount.get(e.source) || 0) + 1);
        }
    }

    const rankedHubCandidates = [...files].sort((a, b) =>
        scoreHubFile(b, fileInDegree, fileSymbolsMap) - scoreHubFile(a, fileInDegree, fileSymbolsMap)
    );
    const preferredHubFiles = rankedHubCandidates
        .filter(f => !isNoiseForArchitecture(f.filePath))
        .slice(0, 10)
        .map(f => f.filePath);
    const fallbackHubFiles = rankedHubCandidates
        .slice(0, 10)
        .map(f => f.filePath);
    const hubFiles = [...new Set(preferredHubFiles.length > 0 ? preferredHubFiles : fallbackHubFiles)];

    const rankEntryFiles = (candidates, limit) =>
        [...candidates]
            .sort((a, b) => scoreEntryCandidate(b, fileSymbolsMap, outImportCount, fileInDegree) - scoreEntryCandidate(a, fileSymbolsMap, outImportCount, fileInDegree))
            .slice(0, limit);

    let entryFiles = rankEntryFiles(
        files.filter(f => {
            const inImports = importedBy.get(f.filePath);
            return (outImportCount.get(f.filePath) || 0) > 0 && (!inImports || inImports.size === 0) && isPreferredArchitectureFile(f.filePath);
        }),
        6
    );

    if (entryFiles.length === 0) {
        entryFiles = rankEntryFiles(
            files.filter(f => {
                const inImports = importedBy.get(f.filePath);
                return (outImportCount.get(f.filePath) || 0) > 0 && (!inImports || inImports.size === 0) && !isNoiseForArchitecture(f.filePath);
            }),
            6
        );
    }

    if (entryFiles.length === 0) {
        entryFiles = rankEntryFiles(
            files.filter(f => isPreferredArchitectureFile(f.filePath) && /(^|\/)(?:index|main|app|server|start|bootstrap|entry|autoload|client)\.[^/]+$/i.test(f.filePath)),
            6
        );
    }

    if (entryFiles.length === 0) {
        entryFiles = rankEntryFiles(
            files.filter(f => !isNoiseForArchitecture(f.filePath)),
            4
        );
    }

    if (entryFiles.length === 0) {
        entryFiles = rankEntryFiles(files, 4);
    }

    for (const entry of entryFiles) {
        const node = nodes.find(n => n.id === entry.filePath);
        if (node) node.isEntryPoint = true;
    }

    // ── Symbol-level Processes ──────────────────────────────────────────────────
    const processes = [];
    for (const entry of entryFiles) {
        const stepsArr = [];
        const visited = new Set([entry.filePath]);
        const queue = [entry.filePath];
        let stepIndex = 0;

        const entrySymbols = fileSymbolsMap.get(entry.filePath) || [];
        const mainSymbol = entrySymbols.find(s => s.exportType === 'default')
            || entrySymbols.find(s => s.exportType === 'named')
            || entrySymbols[0];

        stepsArr.push({
            symbolName: mainSymbol?.name || path.basename(entry.filePath, path.extname(entry.filePath)),
            filePath: entry.filePath,
            stepIndex: stepIndex++,
            codeSnippet: mainSymbol?.codeSnippet || undefined,
        });

        let depth = 0;
        while (queue.length > 0 && depth < 4 && stepsArr.length < 8) {
            const nextQueue = [];
            for (const current of queue) {
                const deps = edges
                    .filter(e => e.source === current && e.type === 'IMPORTS')
                    .map(e => e.target)
                    .sort((a, b) => scoreProcessStep(b, fileInDegree) - scoreProcessStep(a, fileInDegree));
                for (const dep of deps) {
                    if (!visited.has(dep) && stepsArr.length < 8) {
                        visited.add(dep);
                        nextQueue.push(dep);
                        const depSymbols = fileSymbolsMap.get(dep) || [];
                        const depSymbol = depSymbols.find(s => s.exportType === 'default')
                            || depSymbols.find(s => s.exportType === 'named')
                            || depSymbols[0];
                        stepsArr.push({
                            symbolName: depSymbol?.name || path.basename(dep, path.extname(dep)),
                            filePath: dep,
                            stepIndex: stepIndex++,
                            codeSnippet: depSymbol?.codeSnippet || undefined,
                        });
                    }
                }
            }
            queue.length = 0;
            queue.push(...nextQueue);
            depth++;
        }

        if (stepsArr.length > 1) {
            processes.push({
                id: `process-${processes.length + 1}-${path.basename(entry.filePath, path.extname(entry.filePath)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                name: `Flow: ${path.basename(entry.filePath)}`,
                description: `Execution flow starting from ${entry.filePath}`,
                steps: stepsArr,
            });
        }
    }

    // ── Summary ─────────────────────────────────────────────────────────────────
    const totalSymbols = nodes.filter(n => n.kind !== 'File').length;
    const keyTechnologies = detectTechnologies(files);
    const architecturePattern = detectArchitecturePattern(files);

    const summary = {
        repoName: '',
        totalFiles: files.length,
        totalSymbols,
        totalEdges: edges.length,
        languages: languageCounts,
        entryPoints: entryFiles.map(f => f.filePath),
        hubFiles,
        architecturePattern,
        keyTechnologies,
        readmeSummary: readmeSummary || undefined,
    };

    return { nodes, edges, clusters, processes, summary };
}
