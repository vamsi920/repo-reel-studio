import { describe, expect, it } from "vitest";
import { shardName } from "#/lib/codegraph/shard-name";

describe("shardName", () => {
  it("names the system view 'root'", () => {
    expect(shardName(null)).toBe("root");
  });

  it("produces a filename-safe name for ids containing / and :", () => {
    const name = shardName("subsystem:payments/module:webhooks");

    expect(name).not.toMatch(/[/:+=]/);
    expect(name.length).toBeGreaterThan(0);
  });

  it("is stable for the same id", () => {
    expect(shardName("subsystem:a")).toBe(shardName("subsystem:a"));
  });

  it("does not collide for deep ids sharing a long prefix", () => {
    // Truncating a long encoded id would map both of these to one shard, which
    // would silently render one folder's contents under another.
    const prefix = `subsystem:folder-legacy/${"module:deeply-nested-path/".repeat(8)}`;

    expect(shardName(`${prefix}alpha`)).not.toBe(shardName(`${prefix}beta`));
  });

  it("keeps names short enough for a filesystem", () => {
    const long = `subsystem:x/${"module:very-long-segment-name/".repeat(20)}leaf`;

    expect(shardName(long).length).toBeLessThanOrEqual(120);
  });

  it("handles non-ASCII ids", () => {
    expect(() => shardName("subsystem:paiements/module:café")).not.toThrow();
    expect(shardName("subsystem:café")).not.toBe(shardName("subsystem:cafe"));
  });
});
