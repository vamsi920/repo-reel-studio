#!/usr/bin/env node
/**
 * Installs the NeoDevEx agent harness where the agent-server loads it for
 * EVERY conversation on this machine — chat, automations and Proactive runs
 * alike (the automation backend builds its own agent, but it still loads
 * user-level skills and sub-agent definitions from the agent-server host):
 *
 *   config/harness/agents/*.md  ->  ~/.openhands/agents/   (sub-agents)
 *   config/harness/skills/*.md  ->  ~/.openhands/skills/   (always-on playbook)
 *
 * Only `neo-*` files are written; anything else the user put in those
 * directories is left alone. Dependency-free (node: builtins only) so the
 * Docker entrypoint and the packaged desktop app can run it too.
 * Set NEODEVEX_HARNESS=0 to skip.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_FILE_PREFIX = "neo-";
const HARNESS_SUBDIRS = ["agents", "skills"];

export const DEFAULT_HARNESS_SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "config",
  "harness",
);

/**
 * @param {{ sourceDir?: string, homeDir?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {string[]} destination paths written
 */
export function installHarness({
  sourceDir = DEFAULT_HARNESS_SOURCE_DIR,
  homeDir = homedir(),
  env = process.env,
} = {}) {
  if (env.NEODEVEX_HARNESS === "0") return [];
  const written = [];
  for (const sub of HARNESS_SUBDIRS) {
    const from = join(sourceDir, sub);
    if (!existsSync(from)) continue;
    const to = join(homeDir, ".openhands", sub);
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (!name.startsWith(HARNESS_FILE_PREFIX) || !name.endsWith(".md")) {
        continue;
      }
      copyFileSync(join(from, name), join(to, name));
      written.push(join(to, name));
    }
  }
  return written;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const sourceDir = process.argv[2] ? resolve(process.argv[2]) : undefined;
  const written = installHarness({ sourceDir });
  console.log(`[harness] installed ${written.length} file(s)`);
}
