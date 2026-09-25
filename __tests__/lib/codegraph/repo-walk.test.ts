import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walk } from "#/lib/codegraph/repo-walk";

describe("walk", () => {
  const dirs: string[] = [];

  function makeRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), "codegraph-walk-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("finds files nested under real directories", () => {
    const root = makeRoot();
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    writeFileSync(join(root, "a.ts"), "");
    writeFileSync(join(root, "src", "b.ts"), "");
    writeFileSync(join(root, "src", "nested", "c.ts"), "");

    const found = walk(root, 100).sort();

    expect(found).toEqual(
      [
        join(root, "a.ts"),
        join(root, "src", "b.ts"),
        join(root, "src", "nested", "c.ts"),
      ].sort(),
    );
  });

  it("skips directories from the default ignore list", () => {
    const root = makeRoot();
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "index.js"), "");
    writeFileSync(join(root, "real.ts"), "");

    const found = walk(root, 100);

    expect(found).toEqual([join(root, "real.ts")]);
  });

  it("stops once the limit is reached", () => {
    const root = makeRoot();
    writeFileSync(join(root, "a.ts"), "");
    writeFileSync(join(root, "b.ts"), "");
    writeFileSync(join(root, "c.ts"), "");

    const found = walk(root, 2);

    expect(found).toHaveLength(2);
  });

  // The real defect: a symlinked directory pointing back at an ancestor is a
  // pattern that shows up in real repositories (release pointers, monorepo
  // package links). Following it with no cycle detection would send the walk
  // into an ever-deepening traversal of the same subtree; the fix is to never
  // follow a directory symlink at all.
  it("does not follow a directory symlink that cycles back to an ancestor", () => {
    const root = makeRoot();
    mkdirSync(join(root, "child"));
    writeFileSync(join(root, "child", "real.ts"), "");
    symlinkSync(root, join(root, "child", "loop"), "dir");

    const found = walk(root, 500);

    expect(found).toEqual([join(root, "child", "real.ts")]);
  });

  it("does not follow a symlinked file", () => {
    const root = makeRoot();
    writeFileSync(join(root, "real.ts"), "");
    symlinkSync(join(root, "real.ts"), join(root, "link.ts"), "file");

    const found = walk(root, 100);

    expect(found).toEqual([join(root, "real.ts")]);
  });

  it("includes .github but skips other dotfiles/dotdirs", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".github"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".github", "workflow.ts"), "");
    writeFileSync(join(root, ".git", "config.ts"), "");
    writeFileSync(join(root, ".hidden.ts"), "");

    const found = walk(root, 100);

    expect(found).toEqual([join(root, ".github", "workflow.ts")]);
  });
});
