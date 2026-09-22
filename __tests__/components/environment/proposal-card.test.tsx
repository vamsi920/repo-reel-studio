import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProposalCard } from "#/components/features/environment/studio/cards/simple-cards";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import {
  useEnvironmentProfile,
  useSaveEnvironmentProfile,
} from "#/hooks/query/use-environment-profile";
import { createEmptyProfile } from "#/lib/environment/types/profile";

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: vi.fn(),
  useSaveEnvironmentProfile: vi.fn(),
}));

const saveProfile = vi.fn();

function renderProposal(
  patch: Record<string, unknown>,
  postResult = vi.fn(),
) {
  const card = {
    id: "proposal-1",
    kind: "proposal" as const,
    patch,
    rationale: "test",
    status: "pending" as const,
  };
  useOnboardingStudioStore.getState().pushCard(card);
  render(<ProposalCard card={card} postResult={postResult} />);
  return postResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  useOnboardingStudioStore.getState().reset();
  vi.mocked(useSaveEnvironmentProfile).mockReturnValue({
    mutate: saveProfile,
    isPending: false,
  } as unknown as ReturnType<typeof useSaveEnvironmentProfile>);
});

describe("ProposalCard", () => {
  it("merges the agent's partial patch onto the current profile instead of overwriting it", async () => {
    // `card.patch` is an intentionally partial diff (e.g. { mode: "hybrid" })
    // and `environmentProfileRepository.put()` does a full upsert with no
    // merge of its own. Saving the patch verbatim used to wipe every field
    // it didn't mention -- providers, network, policy -- the moment "Apply"
    // was clicked.
    const currentProfile = {
      ...createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z"),
      providers: {
        llm: {
          providerId: "anthropic",
          instanceKey: "default",
          config: {},
        },
      },
      network: {
        ...createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z").network,
        mirrors: { "registry.npmjs.org": "nexus.corp/npm" },
      },
    };
    vi.mocked(useEnvironmentProfile).mockReturnValue({
      data: currentProfile,
    } as unknown as ReturnType<typeof useEnvironmentProfile>);

    const user = userEvent.setup();
    renderProposal({ mode: "hybrid" });

    await user.click(screen.getByTestId("workbench-proposal-apply"));

    expect(saveProfile).toHaveBeenCalledTimes(1);
    const [savedProfile] = saveProfile.mock.calls[0];
    expect(savedProfile.mode).toBe("hybrid");
    // Everything the patch didn't mention must survive the save.
    expect(savedProfile.providers).toEqual(currentProfile.providers);
    expect(savedProfile.network.mirrors).toEqual(
      currentProfile.network.mirrors,
    );
  });

  it("merges a nested patch without wiping its section's other fields", async () => {
    const currentProfile = {
      ...createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z"),
      network: {
        ...createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z").network,
        mirrors: { "registry.npmjs.org": "nexus.corp/npm" },
        tlsInterception: "confirmed" as const,
      },
    };
    vi.mocked(useEnvironmentProfile).mockReturnValue({
      data: currentProfile,
    } as unknown as ReturnType<typeof useEnvironmentProfile>);

    const user = userEvent.setup();
    renderProposal({ network: { proxyUrl: "http://proxy.corp:3128" } });

    await user.click(screen.getByTestId("workbench-proposal-apply"));

    const [savedProfile] = saveProfile.mock.calls[0];
    expect(savedProfile.network.proxyUrl).toBe("http://proxy.corp:3128");
    expect(savedProfile.network.mirrors).toEqual(
      currentProfile.network.mirrors,
    );
    expect(savedProfile.network.tlsInterception).toBe("confirmed");
  });

  it("does not save while the current profile has not loaded yet", async () => {
    vi.mocked(useEnvironmentProfile).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useEnvironmentProfile>);

    const user = userEvent.setup();
    renderProposal({ mode: "hybrid" });

    await user.click(screen.getByTestId("workbench-proposal-apply"));

    expect(saveProfile).not.toHaveBeenCalled();
  });
});
