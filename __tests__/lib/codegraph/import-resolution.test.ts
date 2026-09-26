import { describe, expect, it } from "vitest";
import { resolveImportPath } from "#/lib/codegraph/import-resolution";

describe("resolveImportPath", () => {
  it("returns null for a non-relative specifier", () => {
    const result = resolveImportPath("src/caller.ts", "react", () => true);

    expect(result).toBeNull();
  });

  it("resolves a bare relative specifier by trying known extensions", () => {
    const analyzed = new Set(["src/utils.ts"]);

    const result = resolveImportPath(
      "src/caller.ts",
      "./utils",
      (candidate) => analyzed.has(candidate),
    );

    expect(result).toBe("src/utils.ts");
  });

  it("resolves a bare relative specifier to a directory index file", () => {
    const analyzed = new Set(["src/widgets/index.tsx"]);

    const result = resolveImportPath(
      "src/caller.ts",
      "./widgets",
      (candidate) => analyzed.has(candidate),
    );

    expect(result).toBe("src/widgets/index.tsx");
  });

  // The real defect this module fixes: TypeScript's NodeNext/Node16 module
  // resolution requires relative specifiers to carry the compiled `.js`
  // extension even when the real source file is `.ts` -- e.g.
  // `import "./foo.js"` resolving to `foo.ts`. The previous inline resolver
  // only ever appended an extension onto the specifier, so `foo.js` + `.ts`
  // produced the nonsensical `foo.js.ts` and never matched the real file.
  it("resolves a specifier carrying a compiled .js extension to its .ts source", () => {
    const analyzed = new Set(["src/utils.ts"]);

    const result = resolveImportPath(
      "src/caller.ts",
      "./utils.js",
      (candidate) => analyzed.has(candidate),
    );

    expect(result).toBe("src/utils.ts");
  });

  it("resolves a compiled .jsx-style specifier to its .tsx source", () => {
    const analyzed = new Set(["src/widget.tsx"]);

    const result = resolveImportPath(
      "src/caller.ts",
      "./widget.jsx",
      (candidate) => analyzed.has(candidate),
    );

    expect(result).toBe("src/widget.tsx");
  });

  it("prefers an exact match over stripping a compiled extension", () => {
    // The specifier's literal path was analyzed too -- the genuine .js file
    // must win over guessing it really meant a same-named .ts file.
    const analyzed = new Set(["src/utils.js", "src/utils.ts"]);

    const result = resolveImportPath(
      "src/caller.ts",
      "./utils.js",
      (candidate) => analyzed.has(candidate),
    );

    expect(result).toBe("src/utils.js");
  });

  it("walks up parent directories for '../' specifiers", () => {
    const analyzed = new Set(["shared/helpers.ts"]);

    const result = resolveImportPath(
      "src/nested/caller.ts",
      "../../shared/helpers.js",
      (candidate) => analyzed.has(candidate),
    );

    expect(result).toBe("shared/helpers.ts");
  });

  it("returns null when nothing matches any candidate", () => {
    const result = resolveImportPath(
      "src/caller.ts",
      "./missing.js",
      () => false,
    );

    expect(result).toBeNull();
  });
});
