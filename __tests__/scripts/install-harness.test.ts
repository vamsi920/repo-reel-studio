// @vitest-environment node
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installHarness } from "../../scripts/install-harness.mjs";

describe("installHarness", () => {
  it("installs the shipped neo-* sub-agents and skill without touching the user's own files", () => {
    // Arrange
    const home = mkdtempSync(join(tmpdir(), "harness-home-"));
    mkdirSync(join(home, ".openhands", "agents"), { recursive: true });
    writeFileSync(join(home, ".openhands", "agents", "mine.md"), "keep");

    // Act
    installHarness({ homeDir: home, env: {} });

    // Assert
    const agents = readdirSync(join(home, ".openhands", "agents")).sort();
    expect(agents).toContain("mine.md");
    expect(agents).toEqual(
      expect.arrayContaining(["neo-planner.md", "neo-verifier.md"]),
    );
    expect(readdirSync(join(home, ".openhands", "skills"))).toEqual([
      "neo-harness.md",
    ]);
  });

  it("does nothing when NEODEVEX_HARNESS=0", () => {
    const home = mkdtempSync(join(tmpdir(), "harness-home-"));
    expect(
      installHarness({ homeDir: home, env: { NEODEVEX_HARNESS: "0" } }),
    ).toEqual([]);
  });
});
