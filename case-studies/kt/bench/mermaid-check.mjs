// Counts Mermaid blocks that parse with the repo's mermaid version.
//   node case-studies/kt/bench/mermaid-check.mjs <file.md> ...
// Run from the repo root so `mermaid` and `jsdom` resolve from node_modules.
import { JSDOM } from "jsdom";
import fs from "node:fs";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false });

const out = {};
for (const file of process.argv.slice(2)) {
  const blocks = [...fs.readFileSync(file, "utf8").matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  let valid = 0;
  const errors = [];
  for (const block of blocks) {
    try {
      await mermaid.parse(block);
      valid += 1;
    } catch (e) {
      errors.push(String(e.message || e).split("\n")[0].slice(0, 120));
    }
  }
  out[file.split("/").slice(-2).join("/")] = { total: blocks.length, valid, examples: errors.slice(0, 3) };
}
console.log(JSON.stringify(out, null, 1));
