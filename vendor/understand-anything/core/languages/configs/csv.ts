import type { LanguageConfig } from "../types";

export const csvConfig = {
  id: "csv",
  displayName: "CSV",
  extensions: [".csv", ".tsv"],
  concepts: ["headers", "rows", "delimiters", "quoting", "escaping"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: [],
  },
} satisfies LanguageConfig;
