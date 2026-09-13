import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KtManifest, KtScene } from "#/lib/kt-video/build-manifest";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import { narrateManifest } from "#/lib/kt-video/narrate-manifest";

vi.mock("#/api/deepwiki-service/deepwiki-service.api", () => ({
  default: { chatCompletion: vi.fn() },
}));

// Real (unmocked) resolveDeepWikiRepoTarget is exercised here, with just its
// two lower-level dependencies faked — mirrors knowledge-engine.test.ts's own
// coverage of the engine wiring a resolved GitHub target through, for the
// kt-video narration path.
const githubTargetState = vi.hoisted(() => ({ localConnected: false }));
vi.mock("#/api/git-service/github-connection-flag", () => ({
  isLocalGithubConnected: () => githubTargetState.localConnected,
}));
const mintGithubCloneToken = vi.fn();
vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintGithubCloneToken: (...args: unknown[]) => mintGithubCloneToken(...args),
}));

const chatCompletion = vi.mocked(DeepWikiService.chatCompletion);

const snapshot = {
  owner: "local",
  repo: "project",
  localPath: "/workspace/project",
} as RepositorySnapshot;

function scene(overrides: Partial<KtScene>): KtScene {
  return {
    id: 0,
    type: "code",
    file_path: "src/entry.ts",
    title: "entry",
    code: "const a = 1;\nconst b = 2;\n",
    highlight_lines: [1, 2],
    narration_text: "Template narration.",
    sentences: [
      { sentence: "Template narration.", source_refs: [], on_screen_focus: [] },
    ],
    focus_symbols: [],
    durationInFrames: 180,
    startFrame: 0,
    endFrame: 180,
    ...overrides,
  };
}

function manifestOf(scenes: KtScene[]): KtManifest {
  return {
    repo_name: "Auth Flow",
    scenes,
    totalFrames: scenes.reduce((n, s) => n + s.durationInFrames, 0),
    fps: 30,
    repo_files: [],
  };
}

describe("narrateManifest", () => {
  beforeEach(() => {
    chatCompletion.mockReset();
    githubTargetState.localConnected = false;
    mintGithubCloneToken.mockReset();
  });

  it("keeps a concept scene long enough to show every one of its segments", async () => {
    // Four hops at the deterministic builder's pacing is 24s. A terse
    // narration must not retime that down to the single-scene 6s floor and
    // leave each segment on screen for under two seconds.
    const segments = Array.from({ length: 4 }, (_, i) => ({
      file_path: `src/step-${i}.ts`,
      start_line: 1,
      end_line: 3,
      code: "a\nb\nc",
    }));
    const conceptScene = scene({
      id: 0,
      type: "concept",
      segments,
      durationInFrames: 24 * 30,
    });

    chatCompletion.mockResolvedValue(
      JSON.stringify([{ id: 0, narration: "Short line." }]),
    );

    const result = await narrateManifest(manifestOf([conceptScene]), snapshot);

    expect(result.scenes[0].narration_text).toBe("Short line.");
    expect(result.scenes[0].durationInFrames).toBeGreaterThanOrEqual(
      4 * 6 * 30,
    );
  });

  it("does not retime the manifest it was given", async () => {
    const first = scene({
      id: 0,
      durationInFrames: 180,
      startFrame: 0,
      endFrame: 180,
    });
    const second = scene({
      id: 1,
      durationInFrames: 180,
      startFrame: 180,
      endFrame: 360,
    });
    const original = manifestOf([first, second]);

    // Only scene 0 is narrated, and its narration is long enough to grow the
    // scene — which shifts every later scene in the returned manifest.
    chatCompletion.mockResolvedValue(
      JSON.stringify([{ id: 0, narration: "word ".repeat(80).trim() }]),
    );

    const result = await narrateManifest(original, snapshot);

    expect(result.scenes[0].durationInFrames).toBeGreaterThan(180);
    expect(result.scenes[1].startFrame).toBe(result.scenes[0].durationInFrames);
    expect(second.startFrame).toBe(180);
    expect(second.endFrame).toBe(360);
    expect(original.totalFrames).toBe(360);
  });

  it("returns the deterministic manifest untouched when narration fails", async () => {
    chatCompletion.mockRejectedValue(new Error("network down"));
    const original = manifestOf([scene({ id: 0 })]);

    await expect(narrateManifest(original, snapshot)).resolves.toBe(original);
  });

  it("narrates by cloning the GitHub URL with a scoped token, not the sandbox-local path, when a GitHub connection is available", async () => {
    // Regression coverage: DeepWiki runs on its own Fly machine in
    // production, with no filesystem shared with the sandbox that checked
    // the repo out — sending it snapshot.localPath always resolves to 0
    // files there and silently falls back to template narration.
    const githubSnapshot = {
      owner: "acme",
      repo: "api",
      localPath: "/workspace/api",
    } as RepositorySnapshot;
    githubTargetState.localConnected = true;
    mintGithubCloneToken.mockResolvedValue({
      token: "gh-token-123",
      host: "github.com",
    });
    chatCompletion.mockResolvedValue(
      JSON.stringify([{ id: 0, narration: "Real narration." }]),
    );

    await narrateManifest(manifestOf([scene({ id: 0 })]), githubSnapshot);

    expect(chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        repo_url: "https://github.com/acme/api",
        type: "github",
        token: "gh-token-123",
      }),
    );
  });
});
