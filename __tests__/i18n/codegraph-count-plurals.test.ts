import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// The CodeGraph toolbar and details panel pass `{ count }` to these keys, so
// i18next picks the `_one` / `_other` form when it exists. Without the pair,
// a one-node level read "1 nodes" and a single-child folder "Explore 1
// components". Lock the plural forms down at the source of truth
// (translation.json), since the test environment's i18next mock returns keys.
describe("CODEGRAPH count plurals", () => {
  const translationPath = path.join(
    __dirname,
    "../../src/i18n/translation.json",
  );
  const translation = JSON.parse(
    fs.readFileSync(translationPath, "utf-8"),
  ) as Record<string, Record<string, string>>;

  it.each([
    ["CODEGRAPH$NODES", "{{count}} node", "{{count}} nodes"],
    [
      "CODEGRAPH$EXPLORE",
      "Explore {{count}} component",
      "Explore {{count}} components",
    ],
  ])("%s has singular and plural English forms", (key, one, other) => {
    expect(translation[`${key}_one`]?.en).toBe(one);
    expect(translation[`${key}_other`]?.en).toBe(other);
  });

  it("ships the plural pair in every locale the base key has", () => {
    for (const key of ["CODEGRAPH$NODES", "CODEGRAPH$EXPLORE"]) {
      const locales = Object.keys(translation[key]);
      expect(Object.keys(translation[`${key}_one`])).toEqual(locales);
      expect(Object.keys(translation[`${key}_other`])).toEqual(locales);
    }
  });
});
