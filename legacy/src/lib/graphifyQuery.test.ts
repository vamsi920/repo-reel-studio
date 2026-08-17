import { describe, expect, it } from "vitest";
import {
  detectGraphIntent,
  graphResultToTraceSteps,
  type GraphPathResult,
} from "@/lib/graphifyQuery";

describe("detectGraphIntent", () => {
  it("detects path questions", () => {
    expect(detectGraphIntent('How does FastAPI connect to ModelField?')).toEqual({
      kind: "path",
      from: "FastAPI",
      to: "ModelField",
    });
    expect(detectGraphIntent("path from A to B")).toEqual({
      kind: "path",
      from: "A",
      to: "B",
    });
  });

  it("detects explain questions", () => {
    expect(detectGraphIntent("Explain APIRouter")).toEqual({
      kind: "explain",
      label: "APIRouter",
    });
    expect(detectGraphIntent("What is DefaultPlaceholder?")).toEqual({
      kind: "explain",
      label: "DefaultPlaceholder",
    });
  });

  it("returns null for generic questions", () => {
    expect(detectGraphIntent("Where should I start reading this repo?")).toBeNull();
  });
});

describe("graphResultToTraceSteps", () => {
  it("maps path edges to hop steps", () => {
    const result: GraphPathResult = {
      available: true,
      kind: "path",
      hops: 1,
      edges: [
        {
          from: "get_request_handler()",
          to: "FastAPI",
          relation: "calls",
          confidence: "EXTRACTED",
          label: "FastAPI <--calls [EXTRACTED]-- get_request_handler()",
        },
      ],
    };
    const steps = graphResultToTraceSteps(result);
    expect(steps).toHaveLength(1);
    expect(steps[0].summary).toContain("EXTRACTED");
  });
});
