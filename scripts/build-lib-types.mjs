#!/usr/bin/env node
/**
 * Emits the library's .d.ts files into `dist/`, laid out relative to `src/`
 * (so `dist/index.d.ts` matches the `types` entries in package.json).
 *
 * `tsc` needs `rootDir` to contain every file in the program, and the
 * CodeGraph modules import vendored sources from `vendor/`, so it is compiled
 * with the repo root as `rootDir` into a scratch directory and only the
 * `src/` part is moved into `dist/`. The vendored declarations are internal
 * to those modules and are not part of the public entry points.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "lib-types-"));
const tsc = spawnSync(
  "npx",
  ["tsc", "-p", "tsconfig.lib.json", "--outDir", scratch],
  { stdio: "inherit", shell: process.platform === "win32" },
);

try {
  if (tsc.status !== 0) process.exit(tsc.status ?? 1);
  const emitted = join(scratch, "src");
  if (!existsSync(join(emitted, "index.d.ts"))) {
    console.error("build-lib-types: tsc did not emit src/index.d.ts");
    process.exit(1);
  }
  cpSync(emitted, "dist", { recursive: true });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
