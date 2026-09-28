import { describe, expect, it } from "vitest";
import {
  buildCloudSkillsUrl,
  CLOUD_HIDDEN_EXTENSION_PATH,
  CLOUD_LINKED_EXTENSION_PATH,
} from "#/components/features/skills/extensions-nav-constants";

describe("extensions nav constants", () => {
  it("exposes the cloud-linked and cloud-hidden paths used by both nav renderings", () => {
    expect(CLOUD_LINKED_EXTENSION_PATH).toBe("/skills");
    expect(CLOUD_HIDDEN_EXTENSION_PATH).toBe("/plugins");
  });
});

describe("buildCloudSkillsUrl", () => {
  it("appends the settings/skills path to a bare host", () => {
    expect(buildCloudSkillsUrl("https://app.example.dev")).toBe(
      "https://app.example.dev/settings/skills",
    );
  });

  it("strips trailing slashes before appending the path", () => {
    expect(buildCloudSkillsUrl("https://app.example.dev/")).toBe(
      "https://app.example.dev/settings/skills",
    );
    expect(buildCloudSkillsUrl("https://app.example.dev///")).toBe(
      "https://app.example.dev/settings/skills",
    );
  });
});
