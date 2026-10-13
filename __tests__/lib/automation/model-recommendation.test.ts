import { describe, expect, it } from "vitest";
import { recommendModelProfile } from "#/lib/automation/model-recommendation";

const profile = (name: string, model: string) => ({
  name,
  model,
  base_url: null,
  api_key_set: true,
});

const profiles = [
  profile("flash", "gemini/gemini-2.5-flash"),
  profile("pro", "gemini/gemini-2.5-pro"),
  profile("opus", "anthropic/claude-opus-4"),
];

describe("recommendModelProfile", () => {
  it.each([
    [
      "suggests the cheapest frontier profile for review work on a light model",
      { selected: "", active: "flash", prompt: "Review each new pull request" },
      "pro",
    ],
    [
      "stays quiet when the chosen model is already frontier",
      { selected: "opus", active: "flash", prompt: "Triage new issues" },
      null,
    ],
    [
      "stays quiet for routine work",
      { selected: "", active: "flash", prompt: "Write the weekly changelog" },
      null,
    ],
  ])("%s", (_label, input, expected) => {
    expect(recommendModelProfile({ profiles, ...input })).toBe(expected);
  });

  it("has nothing to suggest without a stronger saved profile", () => {
    expect(
      recommendModelProfile({
        profiles: [profiles[0]],
        selected: "",
        active: "flash",
        prompt: "Investigate the crash",
      }),
    ).toBeNull();
  });
});
