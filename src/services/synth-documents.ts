import {
  extractFromDocument,
  readDocument,
  requirementCoverage,
  type DocRequirement,
  type DocumentExtraction,
} from "#/lib/synth/documents";
import { slugId } from "#/lib/synth/model";
import { SYNTH_INPUT_DIR, writeWorkspaceFiles } from "#/lib/synth/workspace";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import {
  newSynthId,
  useSynthStudioStore,
  type SynthDocument,
  type SynthProject,
} from "#/stores/synth-studio-store";

/**
 * Requirement documents (BRD, FRD, SRS, data dictionaries) as a source of
 * a Neo Synth model, for projects with or without a codebase.
 *
 * The browser reads the file, removes personal values, and extracts what
 * it can deterministically (see `extractFromDocument`); the result is
 * merged into the project's model at once, so the user sees entities
 * before the agent has said a word. The scrubbed text is written to the
 * agent's workspace (`synth-input/<project>/<doc>.md`) for the agent to
 * read in full and refine the model from. The original file is only
 * written when its text could not be read here (a scanned PDF), so the
 * agent can try its own tools.
 */

/** Scrubbed text of this tab's documents, for describe's chunked reads. */
const textCache = new Map<string, string>();
/** Originals of unreadable files, until they are written to the workspace. */
const originalCache = new Map<string, Uint8Array>();

export const DOCUMENT_CHUNK_CHARS = 12_000;

export function documentText(documentId: string): string | undefined {
  return textCache.get(documentId);
}

export function clearDocumentCache() {
  textCache.clear();
  originalCache.clear();
}

export interface IngestOutcome {
  ok: boolean;
  document?: SynthDocument;
  extraction?: Pick<
    DocumentExtraction,
    "entities" | "rules" | "requirements" | "warnings" | "personalValuesRemoved"
  >;
  reason?: string;
}

/** The workspace folder a project's documents are written to. */
export function documentDir(projectId: string): string {
  return `${SYNTH_INPUT_DIR}/${projectId}`;
}

function documentIdFor(project: SynthProject, name: string): string {
  const base = slugId(name.replace(/\.[^.]+$/, "")) || "document";
  const taken = new Set((project.documents ?? []).map((d) => d.id));
  // Re-uploading the same file replaces it; a different file never collides.
  const same = (project.documents ?? []).find((d) => d.name === name);
  if (same) return same.id;
  let id = base.slice(0, 40);
  for (let n = 2; taken.has(id); n += 1) id = `${base.slice(0, 36)}_${n}`;
  return id;
}

/** Requirement ids are unique per project: a second document's BR-1 is not the first's. */
function namespaceRequirements(
  project: SynthProject,
  documentId: string,
  requirements: DocRequirement[],
): DocRequirement[] {
  const taken = new Set(
    (project.requirements ?? [])
      .filter((r) => r.docId !== documentId)
      .map((r) => r.id),
  );
  return requirements.map((r) =>
    taken.has(r.id)
      ? { ...r, id: `${documentId}:${r.id}`, docId: documentId }
      : { ...r, docId: documentId },
  );
}

/**
 * Reads, extracts and merges one document into a project. Writes it to the
 * workspace when a runtime is given (otherwise `flushDocuments` does it
 * once the studio has one). Never throws.
 */
export async function ingestDocument(
  projectId: string,
  file: { name: string; bytes: Uint8Array },
  options: {
    addedBy: SynthDocument["addedBy"];
    runInWorkspace?: RunInWorkspace;
    now?: () => number;
  },
): Promise<IngestOutcome> {
  const store = useSynthStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return { ok: false, reason: "no_project" };
  const read = readDocument(file.name, file.bytes);
  const id = documentIdFor(project, file.name);
  if (!read.text && !read.unreadable) {
    return { ok: false, reason: read.warnings[0] ?? "empty" };
  }
  if (!read.text && read.format !== "pdf") {
    return { ok: false, reason: read.warnings[0] ?? "unreadable" };
  }
  const extraction = extractFromDocument(read.text, {
    docName: file.name,
    docId: id,
  });
  const requirements = namespaceRequirements(
    project,
    id,
    extraction.requirements,
  );
  const at = new Date((options.now ?? Date.now)()).toISOString();
  const document: SynthDocument = {
    id,
    name: file.name.slice(0, 160),
    format: read.format,
    bytes: file.bytes.length,
    chars: extraction.text.length,
    addedAt: at,
    addedBy: options.addedBy,
    workspacePath: null,
    originalPath: null,
    unreadable: read.unreadable,
    personalValuesRemoved: extraction.personalValuesRemoved,
    entities: extraction.entities.map((e) => e.id),
    fields: extraction.entities.reduce((n, e) => n + e.fields.length, 0),
    rules: extraction.rules.length,
    warnings: [...read.warnings, ...extraction.warnings].slice(0, 20),
  };
  textCache.set(id, extraction.text);
  if (read.unreadable) originalCache.set(id, file.bytes);
  else originalCache.delete(id);

  if (extraction.entities.length) {
    store.upsertEntities(projectId, extraction.entities);
  }
  if (extraction.rules.length) store.upsertRules(projectId, extraction.rules);
  store.addDocument(projectId, document, requirements);
  if (project.status === "intake" && extraction.entities.length) {
    store.setStatus(projectId, "modeling");
  }
  store.appendLog(projectId, {
    id: newSynthId("log"),
    level: extraction.entities.length ? "success" : "warn",
    text: extraction.entities.length
      ? `Read ${file.name}: ${extraction.entities.length} entities, ${document.fields} fields, ${extraction.rules.length} rules, ${requirements.length} requirements`
      : `Read ${file.name}: no data model found in the text yet${read.unreadable ? " (no readable text layer)" : ""}`,
    at,
  });
  if (extraction.personalValuesRemoved) {
    store.appendLog(projectId, {
      id: newSynthId("log"),
      level: "info",
      text: `Removed ${extraction.personalValuesRemoved} personal value(s) from ${file.name} before keeping anything`,
      at,
    });
  }
  if (options.runInWorkspace) {
    await flushDocuments(projectId, options.runInWorkspace);
  }
  return {
    ok: true,
    document:
      useSynthStudioStore
        .getState()
        .projects[projectId]?.documents.find((d) => d.id === id) ?? document,
    extraction: {
      entities: extraction.entities,
      rules: extraction.rules,
      requirements,
      warnings: document.warnings,
      personalValuesRemoved: extraction.personalValuesRemoved,
    },
  };
}

/**
 * Writes every document of the project that is not in the workspace yet
 * and whose text this tab still holds. Returns the paths written.
 */
export async function flushDocuments(
  projectId: string,
  run: RunInWorkspace,
): Promise<string[]> {
  const store = useSynthStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return [];
  const dir = documentDir(projectId);
  const pending = (project.documents ?? []).filter(
    (d) => !d.workspacePath && textCache.has(d.id),
  );
  const written: string[] = [];
  for (const doc of pending) {
    const files: { path: string; text?: string; bytes?: Uint8Array }[] = [
      { path: `${doc.id}.md`, text: textCache.get(doc.id) ?? "" },
    ];
    const original = originalCache.get(doc.id);
    const ext = doc.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
    if (original)
      files.push({ path: `${doc.id}.original${ext}`, bytes: original });
    const result = await writeWorkspaceFiles(run, dir, files);
    if (!result.ok) {
      store.appendLog(projectId, {
        id: newSynthId("log"),
        level: "warn",
        text: `Could not write ${doc.name} for the agent: ${result.error ?? "unknown error"}`,
        at: new Date().toISOString(),
      });
      continue;
    }
    store.setDocumentPaths(projectId, doc.id, {
      workspacePath: `${dir}/${doc.id}.md`,
      originalPath: original ? `${dir}/${doc.id}.original${ext}` : null,
    });
    originalCache.delete(doc.id);
    written.push(`${dir}/${doc.id}.md`);
  }
  return written;
}

/** Evidence strings of the model, where agent-added citations live. */
export function modelEvidence(project: SynthProject): string[] {
  const { model } = project;
  return [
    ...model.entities.flatMap((e) => [
      ...e.evidence,
      ...e.fields.map((f) => f.context ?? ""),
    ]),
    ...model.rules.flatMap((r) => [...(r.evidence ?? []), r.description]),
    ...model.flows.flatMap((f) => f.evidence ?? []),
  ];
}

export function projectCoverage(project: SynthProject) {
  return requirementCoverage(
    project.requirements ?? [],
    modelEvidence(project),
  );
}

/** What describe says about documents (and, on request, a chunk of one). */
export function describeDocuments(
  project: SynthProject,
  request: { documentId?: string; offset?: number } = {},
) {
  const documents = project.documents ?? [];
  if (documents.length === 0) return {};
  const coverage = projectCoverage(project);
  const out: Record<string, unknown> = {
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      format: d.format,
      path: d.workspacePath,
      original_path: d.originalPath || undefined,
      text_available: textCache.has(d.id),
      unreadable: d.unreadable || undefined,
      entities: d.entities,
      rules: d.rules,
      personal_values_removed: d.personalValuesRemoved || undefined,
      warnings: d.warnings.length ? d.warnings.slice(0, 8) : undefined,
    })),
    requirements: {
      total: (project.requirements ?? []).length,
      data: coverage.data,
      covered: coverage.covered,
      // What the documents ask for that the model does not show yet: read
      // these in the document, model them, and cite the id in evidence.
      uncovered: coverage.uncovered.slice(0, 40).map((r) => ({
        id: r.id,
        text: r.text,
        section: r.section,
      })),
    },
  };
  if (request.documentId) {
    const text = textCache.get(request.documentId);
    const offset = Math.max(0, Math.floor(request.offset ?? 0));
    out.document_text = text
      ? {
          document_id: request.documentId,
          offset,
          next_offset:
            offset + DOCUMENT_CHUNK_CHARS < text.length
              ? offset + DOCUMENT_CHUNK_CHARS
              : null,
          total_chars: text.length,
          text: text.slice(offset, offset + DOCUMENT_CHUNK_CHARS),
        }
      : {
          document_id: request.documentId,
          error: "text_not_in_this_tab",
          guidance: "Read the document from its path with your file tools.",
        };
  }
  return out;
}
