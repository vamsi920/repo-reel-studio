#!/usr/bin/env node
/**
 * Rasterise the desktop brand assets from their SVG masters.
 *
 *   npm run render-brand-assets
 *
 * Sources (electron/build-resources/brand/):
 *   icon.svg            → electron/build-resources/icon.png  (1024×1024 master;
 *                         feed it to `npm run generate-icons` for .icns/.ico)
 *   tray-template.svg   → electron/build-resources/trayTemplate.png + @2x
 *                         (macOS menu-bar template image: black + alpha)
 *   dmg-background.svg  → electron/build-resources/dmg-background.png + @2x,
 *                         merged into dmg-background.tiff for Retina DMGs
 *
 * Uses the Playwright Chromium already installed for the e2e suites, so no
 * extra native dependency (rsvg/sharp) is needed. The outputs are COMMITTED.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resDir = join(repoRoot, "electron", "build-resources");
const brandDir = join(resDir, "brand");

/** @type {{svg: string, out: string, width: number, height: number, scale?: number}[]} */
export const RENDER_TARGETS = [
  { svg: "icon.svg", out: "icon.png", width: 1024, height: 1024 },
  { svg: "tray-template.svg", out: "trayTemplate.png", width: 22, height: 22 },
  {
    svg: "tray-template.svg",
    out: "trayTemplate@2x.png",
    width: 22,
    height: 22,
    scale: 2,
  },
  { svg: "dmg-background.svg", out: "dmg-background.png", width: 540, height: 380 },
  {
    svg: "dmg-background.svg",
    out: "dmg-background@2x.png",
    width: 540,
    height: 380,
    scale: 2,
  },
];

async function render() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const target of RENDER_TARGETS) {
      const svg = readFileSync(join(brandDir, target.svg), "utf8");
      const page = await browser.newPage({
        viewport: { width: target.width, height: target.height },
        deviceScaleFactor: target.scale ?? 1,
      });
      await page.setContent(
        `<!doctype html><html><head><style>
          html,body{margin:0;padding:0;background:transparent;overflow:hidden}
          svg{display:block;width:${target.width}px;height:${target.height}px}
        </style></head><body>${svg}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: join(resDir, target.out),
        omitBackground: true,
        type: "png",
      });
      await page.close();
      console.log(`[brand] wrote ${target.out}`);
    }
  } finally {
    await browser.close();
  }
}

/** Merge 1x + 2x PNGs into one multi-representation TIFF (macOS only). */
function buildDmgTiff() {
  const out = join(resDir, "dmg-background.tiff");
  if (process.platform !== "darwin") {
    console.log("[brand] skipping dmg-background.tiff (needs macOS tiffutil)");
    return;
  }
  if (existsSync(out)) unlinkSync(out);
  const r = spawnSync(
    "tiffutil",
    [
      "-cathidpicheck",
      join(resDir, "dmg-background.png"),
      join(resDir, "dmg-background@2x.png"),
      "-out",
      out,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("tiffutil failed");
  console.log("[brand] wrote dmg-background.tiff");
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  mkdirSync(resDir, { recursive: true });
  await render();
  buildDmgTiff();
}
