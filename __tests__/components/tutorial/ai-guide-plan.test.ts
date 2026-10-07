import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseGuidePlan,
  runPlannedGuide,
  type PlannedGuideOptions,
} from "#/components/features/tutorial/ai-guide/plan-guide";
import {
  getCuratedUiMapTestIds,
  type UiMapEntry,
} from "#/components/features/tutorial/ai-guide/ui-map";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("#/lib/data-platform/client", () => ({
  supabase: { functions: { invoke } },
}));

const UI_MAP: UiMapEntry[] = [
  {
    id: "automations.add",
    route: "/automations",
    testIds: ["automations-add-automation"],
    label: "Add Automation",
    purpose: "Open the form.",
  },
];

const ADD_STEP = {
  uiId: "automations.add",
  kind: "click",
  title: "Add an automation",
  tip: "Opens the form for a new automation.",
};

function reply(plan: unknown) {
  return {
    data: { choices: [{ message: { content: JSON.stringify(plan) } }] },
    error: null,
  };
}

function makeOptions(overrides: Partial<PlannedGuideOptions> = {}) {
  return {
    query: "build an automation",
    language: "en",
    uiMap: UI_MAP,
    allowedRoutes: ["/automations"],
    doneTitle: "Done",
    navigate: vi.fn(),
    presentStep: vi.fn().mockResolvedValue(undefined),
    advance: vi.fn(),
    setPlanning: vi.fn(),
    registerStop: vi.fn(),
    runLive: vi.fn().mockResolvedValue({ outcome: "completed", steps: 2 }),
    ...overrides,
  } satisfies PlannedGuideOptions;
}

afterEach(() => {
  vi.useRealTimers();
  invoke.mockReset();
  document.body.innerHTML = "";
});

describe("planned AI guide", () => {
  it("drops planned steps that name controls outside the UI map", () => {
    const plan = parseGuidePlan(
      `\`\`\`json\n${JSON.stringify({
        steps: [ADD_STEP, { ...ADD_STEP, uiId: "made.up" }],
        done: { tip: "All set." },
      })}\n\`\`\``,
      new Set(["automations.add"]),
    );

    expect(plan?.steps).toEqual([ADD_STEP]);
  });

  it("hands the step to the live agent when its control never shows up", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(
      reply({ steps: [ADD_STEP], done: { tip: "All set." } }),
    );
    const options = makeOptions();

    const run = runPlannedGuide(options);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(run).resolves.toEqual({ outcome: "completed", steps: 2 });
    expect(options.navigate).toHaveBeenCalledWith("/automations");
    expect(options.presentStep).not.toHaveBeenCalled();
    expect(options.runLive).toHaveBeenCalledWith(
      expect.stringContaining('"Add an automation"'),
    );
  });

  it("goes live straight away when the plan can't be used", async () => {
    invoke.mockResolvedValue({
      data: { choices: [{ message: { content: "not json" } }] },
      error: null,
    });
    const options = makeOptions();

    await runPlannedGuide(options);

    expect(options.runLive).toHaveBeenCalledWith("build an automation");
  });
});

describe("UI map", () => {
  // Test ids built from a variable in the source, e.g. `connector-connect-${id}`.
  const DYNAMIC_PREFIXES = ["connector-connect-"];

  function sourceText(dir: string): string {
    return readdirSync(dir)
      .map((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          return name === "i18n" ? "" : sourceText(path);
        }
        return /\.tsx?$/.test(name) && !path.endsWith("ui-map.ts")
          ? readFileSync(path, "utf8")
          : "";
      })
      .join("\n");
  }

  it("only lists test ids that still exist in the app", () => {
    const source = sourceText(join(__dirname, "../../../src"));

    const missing = getCuratedUiMapTestIds().filter(
      (id) =>
        !source.includes(`"${id}"`) &&
        !DYNAMIC_PREFIXES.some(
          (prefix) => id.startsWith(prefix) && source.includes(prefix),
        ),
    );

    expect(missing).toEqual([]);
  });
});
