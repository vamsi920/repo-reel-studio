import { describe, expect, it } from "vitest";

import { compressRepoMemoryContext } from "@/lib/repoInvestigator";

describe("repoInvestigator memory context compression", () => {
  it("compresses natural-language memory context", () => {
    const input =
      "This section is basically a high-level explanation that you could consider shortening for prompt efficiency.";
    const result = compressRepoMemoryContext(input, "memory-basic");
    expect(result.usedCompression).toBe(true);
    expect(result.text.length).toBeLessThan(input.length);
  });

  it("falls back to original when path preservation warning appears", () => {
    const input = "Review path ./src/server/api.ts and keep this guidance unchanged.";
    const result = compressRepoMemoryContext(input, "memory-path-risk", {
      simplifyProse: (template) => template.replaceAll(/@@\d+@@/g, ""),
    });
    expect(result.usedCompression).toBe(false);
    expect(result.fallbackReason).toBe("path_or_url_risk");
    expect(result.text).toBe(input);
  });

  it("falls back to original when URL validation fails", () => {
    const input = "Reference docs at https://example.com/security/policy for verification.";
    const result = compressRepoMemoryContext(input, "memory-url-risk", {
      simplifyProse: (template) => template.replaceAll(/@@\d+@@/g, ""),
    });
    expect(result.usedCompression).toBe(false);
    expect(result.fallbackReason).toBe("path_or_url_risk");
    expect(result.text).toBe(input);
  });
});
