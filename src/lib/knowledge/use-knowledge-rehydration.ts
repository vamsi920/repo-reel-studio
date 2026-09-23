import { useEffect, useRef, useState } from "react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  resolveOrgId,
  findRepositoryUuid,
} from "#/lib/data-platform/repositories/repository-identity";
import { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
import {
  useConnectedRepositories,
  resolveCommitSha,
} from "#/lib/knowledge/connected-repositories";
import { generateKnowledge } from "#/lib/knowledge/generate-knowledge";

/** Parses the `"owner/repo@branch"` repositoryId shape produced by
 * kt-list.tsx's useConnectedRepositories/AddRepositoryTrigger. */
function parseRepositoryId(
  repositoryId: string,
): { owner: string; repo: string; branch: string } | null {
  const atIdx = repositoryId.lastIndexOf("@");
  if (atIdx === -1) return null;
  const branch = repositoryId.slice(atIdx + 1);
  const [owner, repo] = repositoryId.slice(0, atIdx).split("/");
  if (!owner || !repo || !branch) return null;
  return { owner, repo, branch };
}

/** Content-only fallback: checks Supabase for a previously-persisted
 * generation and seeds the store from it, so Docs renders real content
 * instead of "hasn't been generated yet" even with no live session. Used
 * only when no live conversation exists for this repo (see
 * `useKnowledgeRehydration` below) — a hydrated entry this way has
 * `conversationUrl`/`sessionApiKey: null` and `localPath: ""`, so Watch KT
 * and CodeGraph correctly ask for a live session rather than silently
 * failing. Best-effort: any failure (unconfigured, RLS, nothing found) just
 * leaves today's empty-state fallback in place. */
async function tryColdRehydration(
  repositoryId: string,
  parsed: { owner: string; repo: string; branch: string },
  hydrate: (
    repositoryId: string,
    snapshot: Parameters<
      ReturnType<typeof useKnowledgeStore.getState>["hydrate"]
    >[1],
    knowledge: Parameters<
      ReturnType<typeof useKnowledgeStore.getState>["hydrate"]
    >[2],
    qualityFlags: Parameters<
      ReturnType<typeof useKnowledgeStore.getState>["hydrate"]
    >[3],
  ) => void,
): Promise<boolean> {
  const orgId = await resolveOrgId();
  if (!orgId) return false;
  const repositoryUuid = await findRepositoryUuid(
    orgId,
    parsed.owner,
    parsed.repo,
  );
  if (!repositoryUuid) return false;
  const knowledge =
    await knowledgePersistenceRepository.getLatestGenerationForRepository(
      repositoryUuid,
      parsed.branch,
    );
  if (!knowledge) return false;
  hydrate(
    repositoryId,
    {
      repositoryId,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
      commitSha: knowledge.commitSha,
      localPath: "",
    },
    knowledge,
    [],
  );
  return true;
}

/**
 * On a cold page load (direct navigation, reload) the in-memory knowledge
 * store starts empty even for a repo generated in an earlier session. This
 * prefers a REAL, live entry whenever a conversation for this repo already
 * exists (found the same way kt-list.tsx finds connected repos) — resolving
 * its commit and calling `generateKnowledge`, which hits DeepWiki's own
 * cache for an already-generated commit (fast) and, critically, populates
 * real `conversationUrl`/`sessionApiKey`/`localPath`, so Watch KT and
 * CodeGraph work immediately rather than asking the user to "open a live
 * session" for a repo that already has one open. Only falls back to the
 * content-only Supabase stub when no live conversation exists at all.
 *
 * Every `kt/:repositoryId/...` route calls this, not just the Docs tab: the
 * CodeGraph, Video KT and page routes are siblings of the Docs route, not
 * children of it, so a deep link, reload or bookmark of any of them lands on
 * a cold store too. Each renders its loading state until this reports
 * `true`, then falls through to its own "not found" only if nothing was
 * hydrated.
 */
export function useKnowledgeRehydration(
  repositoryId: string | undefined,
): boolean {
  const hasEntry = useKnowledgeStore((s) =>
    repositoryId ? Boolean(s.byRepositoryId[repositoryId]) : true,
  );
  // An entry existing is not the same as generation being *done*: a live
  // attempt (this hook's own, or one started elsewhere, e.g. kt-list.tsx)
  // creates the entry via `startGenerating` up front, well before real
  // `knowledge` lands. Without this, the "already have an entry, nothing to
  // do" branch below fired the moment that entry appeared and reported
  // `checked: true` while `knowledge` was still null -- routes read that as
  // "confirmed not generated" and rendered "hasn't been generated yet" for
  // the entire duration of a real, in-progress generation.
  const isEntrySettled = useKnowledgeStore((s) => {
    if (!repositoryId) return true;
    const status = s.byRepositoryId[repositoryId]?.status;
    return status === "ready" || status === "error";
  });
  const hydrate = useKnowledgeStore((s) => s.hydrate);
  const startGenerating = useKnowledgeStore((s) => s.startGenerating);
  const setProgress = useKnowledgeStore((s) => s.setProgress);
  const setReady = useKnowledgeStore((s) => s.setReady);
  const setError = useKnowledgeStore((s) => s.setError);
  const { repositories: connected, isLoading: connectedLoading } =
    useConnectedRepositories();
  const { backend } = useActiveBackend();
  const [checked, setChecked] = useState(isEntrySettled);
  const attemptedRef = useRef<string | null>(null);

  const liveMatch = repositoryId
    ? connected.find((c) => c.repositoryId === repositoryId)
    : undefined;
  // The conversation list re-polls every 10s and the matching conversation's
  // metadata (status, timestamps) changes while its clone runs, so
  // `liveMatch` is a fresh object almost every tick even when nothing this
  // hook cares about has moved. Keying the effect on the fields it actually
  // uses keeps a refetch from cancelling an attempt that is still waiting
  // on the clone (`resolveCommitSha` polls for up to 90s).
  const liveKey = liveMatch
    ? [
        liveMatch.owner,
        liveMatch.repo,
        liveMatch.branch,
        liveMatch.workingDir ?? "",
        liveMatch.conversationUrl ?? "",
        liveMatch.sessionApiKey ?? "",
      ].join("\0")
    : null;
  const liveMatchRef = useRef(liveMatch);
  liveMatchRef.current = liveMatch;

  useEffect(() => {
    if (hasEntry || !repositoryId) {
      // An entry already exists (ours or a sibling route's) -- never start a
      // second, duplicate rehydration/generation attempt for it, but only
      // report "checked" once it has actually settled (see `isEntrySettled`
      // above); re-runs as the entry's status changes so a foreign
      // in-flight generation still flips this to `true` once it lands.
      setChecked(isEntrySettled);
      return undefined;
    }
    const parsed = parseRepositoryId(repositoryId);
    if (!parsed) {
      setChecked(true);
      return undefined;
    }
    // Wait for the connected-repositories query to settle before deciding
    // there's no live conversation — `connected` starts empty on first
    // render regardless of whether one actually exists. Gate on the query's
    // own loading flag, not on the list being empty: a user with no open
    // conversations at all has a permanently empty list, and gating on that
    // left this page spinning forever instead of falling back to the
    // persisted Supabase content this hook exists to load.
    if (liveKey === null && connectedLoading) return undefined;
    if (attemptedRef.current === repositoryId) return undefined;
    attemptedRef.current = repositoryId;
    // `checked` is local component state, but this route (`kt/:repositoryId`)
    // is reused across navigations between repositories — React doesn't
    // remount just because the param changed. Without this reset, switching
    // from a repo that had already settled `checked: true` (e.g. an earlier,
    // already-hydrated repo) straight to a fresh repo that still needs this
    // attempt would render "not found" for the new repo until the attempt
    // below finishes, instead of the loading state it's actually in.
    setChecked(false);

    let cancelled = false;
    // `generateKnowledge` calls `store.startGenerating` synchronously at the
    // very start of every attempt (success or failure alike), which flips
    // `hasEntry` true and makes React re-run this effect -- so by the time
    // `await generateKnowledge(...)` below resolves, this closure's own
    // `cancelled` is already true almost every time, including on the
    // ordinary success path (it's just never read there). A live-generation
    // failure needs to fall through to cold rehydration regardless of that
    // self-inflicted flip, so it's tracked separately from real
    // cancellation (an actual unmount/repositoryId change).
    let liveGenerationFailed = false;
    const liveMatch = liveMatchRef.current;
    (async () => {
      if (liveMatch?.workingDir) {
        try {
          const commitSha = await resolveCommitSha(
            liveMatch.owner,
            liveMatch.repo,
            liveMatch.workingDir,
            liveMatch.conversationUrl,
            liveMatch.sessionApiKey,
          );
          if (cancelled) return;
          await generateKnowledge(
            {
              repositoryId,
              owner: liveMatch.owner,
              repo: liveMatch.repo,
              branch: liveMatch.branch,
              commitSha,
              localPath: liveMatch.workingDir,
            },
            liveMatch.conversationUrl,
            liveMatch.sessionApiKey,
            { startGenerating, setProgress, setReady, setError },
            () => {},
            {},
            backend.id,
          );
          // `generateKnowledge` never rethrows -- an internal failure (e.g.
          // DeepWiki down or rate-limited) resolves normally after calling
          // `store.setError`. Without this check that "success" short-circuited
          // straight past the cold-rehydration fallback below, so a repo with
          // real persisted Supabase content showed the raw live-attempt error
          // instead whenever a (currently failing) live conversation happened
          // to be open for it -- strictly worse than having no live
          // conversation at all. Only fall through when it actually failed; a
          // genuine "ready" (or still-"generating") must not be overwritten
          // by stale persisted content.
          if (
            useKnowledgeStore.getState().byRepositoryId[repositoryId]
              ?.status !== "error"
          ) {
            return;
          }
          liveGenerationFailed = true;
        } catch {
          // Fall through to the content-only Supabase stub below rather
          // than leaving the page stuck on a live-session attempt that
          // failed (e.g. the clone never finished).
        }
      }
      if (!cancelled || liveGenerationFailed) {
        try {
          await tryColdRehydration(repositoryId, parsed, hydrate);
        } catch (error) {
          // Best-effort: an unconfigured/unreachable Supabase, an RLS
          // denial, or a missing generation must not reject out of this
          // effect — the empty-state fallback below covers it. But the
          // failure itself must not vanish silently (that's what made a
          // genuinely-generated repo intermittently show "hasn't been
          // generated yet" with zero console signal) — log it.
          console.error(
            "[kt-repository] cold rehydration failed",
            repositoryId,
            error,
          );
        }
      }
    })().finally(() => {
      if (!cancelled || liveGenerationFailed) setChecked(true);
    });
    return () => {
      cancelled = true;
      // A cancelled attempt settles nothing (no store entry, no `checked`),
      // so it must not count as this repository's one attempt — otherwise
      // the re-run that follows bails out here and the page spins forever.
      if (attemptedRef.current === repositoryId) attemptedRef.current = null;
    };
  }, [
    repositoryId,
    hasEntry,
    isEntrySettled,
    hydrate,
    liveKey,
    connectedLoading,
    backend.id,
    startGenerating,
    setProgress,
    setReady,
    setError,
  ]);

  return checked;
}
