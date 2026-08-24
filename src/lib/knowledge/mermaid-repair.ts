import mermaid from "mermaid";
import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "./knowledge-engine";

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

async function isValid(source: string): Promise<string | null> {
  ensureMermaidInitialized();
  try {
    await mermaid.parse(source, { suppressErrors: false });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const REPAIR_FENCE_RE = /```(?:mermaid)?\n?([\s\S]*?)```/;

function extractRepairedBlock(response: string): string {
  const fenced = REPAIR_FENCE_RE.exec(response);
  return (fenced ? fenced[1] : response).trim();
}

/**
 * Validates every real generated Mermaid diagram against the same parser
 * this app renders with, and attempts ONE single-shot LLM repair (re-prompt
 * with the actual parser error) on failure — scoped to a cheaply-detectable
 * syntax failure, not a fuzzy quality judgment, so this deliberately doesn't
 * reopen the "no critique/repair loop" decision for page content generally.
 * Falls back to leaving the diagram as-is (today's "couldn't be rendered"
 * behavior) if the repair also fails to parse, or on any network error.
 */
export async function repairInvalidDiagrams(
  knowledge: KnowledgeRepository,
  snapshot: RepositorySnapshot,
): Promise<KnowledgeRepository> {
  let repairedCount = 0;
  let attemptedCount = 0;

  const pages = await Promise.all(
    knowledge.pages.map(async (page) => {
      if (page.diagrams.length === 0) return page;

      const diagrams = await Promise.all(
        page.diagrams.map(async (diagram) => {
          const error = await isValid(diagram.mermaid);
          if (!error) return diagram;

          attemptedCount += 1;
          try {
            const response = await DeepWikiService.chatCompletion({
              repo_url: snapshot.localPath,
              type: "local",
              provider: "google",
              messages: [
                {
                  role: "user",
                  content: `The following Mermaid diagram fails to parse with this exact error:\n\n${error}\n\nOriginal diagram:\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\`\n\nReturn ONLY a corrected Mermaid diagram (same diagram type and content, fixing only the syntax error) in a single \`\`\`mermaid code fence. No explanation.`,
                },
              ],
            });
            const repaired = extractRepairedBlock(response);
            const repairError = repaired
              ? await isValid(repaired)
              : "empty response";
            if (!repairError) {
              repairedCount += 1;
              return { ...diagram, mermaid: repaired };
            }
          } catch {
            // Best-effort — leave the diagram as originally generated.
          }
          return diagram;
        }),
      );

      return { ...page, diagrams };
    }),
  );

  if (attemptedCount > 0) {
    console.info(
      `Mermaid repair: fixed ${repairedCount}/${attemptedCount} invalid diagram(s).`,
    );
  }

  return { ...knowledge, pages };
}
