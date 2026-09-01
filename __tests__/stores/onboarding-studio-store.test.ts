import { describe, expect, it, beforeEach } from "vitest";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";

beforeEach(() => {
  useOnboardingStudioStore.getState().reset();
});

describe("onboarding studio store", () => {
  it("has nowhere for a credential value to land", () => {
    // The security property is structural: a form card carries field NAMES,
    // and the values live only in the form component's own state until they
    // are posted to the Edge Function. If someone later "simplifies" this by
    // lifting form state into the store, this test is what catches it.
    const store = useOnboardingStudioStore.getState();
    store.pushCard({
      id: "form:pinecone:default",
      kind: "form",
      capability: "vector-store",
      providerId: "pinecone",
      instanceKey: "default",
      fields: ["apiKey"],
      status: "open",
    });

    const snapshot = JSON.stringify(useOnboardingStudioStore.getState());
    expect(snapshot).not.toMatch(/"values?"|"credentials"|"secret"/i);
    expect(snapshot).toContain("apiKey"); // the NAME is expected
  });

  it("keeps discovery and plan as single cards", () => {
    const store = useOnboardingStudioStore.getState();
    store.pushCard({ id: "discovery", kind: "discovery" });
    store.pushCard({ id: "discovery", kind: "discovery" });
    store.pushCard({ id: "plan", kind: "plan" });

    const cards = useOnboardingStudioStore.getState().cards;
    // They represent current state, not events; a second copy would just be a
    // stale duplicate sitting above the live one.
    expect(cards.filter((card) => card.kind === "discovery")).toHaveLength(1);
    expect(cards.filter((card) => card.kind === "plan")).toHaveLength(1);
  });

  it("advances the plan pointer past skipped steps", () => {
    const store = useOnboardingStudioStore.getState();
    store.setPlan(
      [
        { id: "a", title: "A", status: "active" },
        { id: "b", title: "B", status: "skipped" },
        { id: "c", title: "C", status: "pending" },
      ],
      "a",
    );
    store.advancePlan("a", "done");
    // "b" was skipped, so the next thing that actually needs doing is "c".
    expect(useOnboardingStudioStore.getState().currentStepId).toBe("c");
  });
});
