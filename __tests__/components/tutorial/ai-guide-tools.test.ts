import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { PageController } from "@page-agent/page-controller";
import {
  createGuideTools,
  redactPageContent,
  resolveIndexedElement,
  type GuideToolsBridge,
} from "#/components/features/tutorial/ai-guide/guide-tools";
import { useAiGuideStore } from "#/components/features/tutorial/ai-guide/ai-guide-store";

type ExecutableTool = {
  execute: (
    this: { pageController: unknown },
    input: Record<string, unknown>,
    ctx: { signal: AbortSignal },
  ) => Promise<string>;
};

const navigate = vi.fn();

function makeBridge(): GuideToolsBridge {
  const store = useAiGuideStore.getState();
  return {
    presentStep: store.presentStep,
    advance: store.advance,
    navigate,
    allowedRoutes: ["/conversations", "/automations"],
    doneTitle: "You're all set",
  };
}

function controllerWith(index: number, element: HTMLElement) {
  return { selectorMap: new Map([[index, { ref: element }]]) };
}

function run(
  tools: ReturnType<typeof createGuideTools>,
  name: string,
  input: Record<string, unknown>,
  pageController: unknown = null,
) {
  const tool = tools[name] as unknown as ExecutableTool;
  return tool.execute.call({ pageController }, input, {
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  navigate.mockClear();
  useAiGuideStore.getState().open("build an automation");
});

afterEach(() => {
  useAiGuideStore.getState().close();
  document.body.innerHTML = "";
});

describe("AI guide tools", () => {
  it("removes every tool that would act on the page, so the user does all clicks", () => {
    const tools = createGuideTools(makeBridge());

    for (const name of [
      "click_element_by_index",
      "input_text",
      "select_dropdown_option",
      "execute_javascript",
      "ask_user",
    ]) {
      expect(tools[name]).toBeNull();
    }
  });

  it("points at the element, shows the AI's text, and waits for the user to click it", async () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    button.append(label);
    button.getBoundingClientRect = () =>
      ({ top: 10, left: 10, width: 120, height: 32 }) as DOMRect;
    document.body.append(button);
    const tools = createGuideTools(makeBridge());

    const pending = run(
      tools,
      "guide_click",
      { index: 3, title: "Open Automate", tip: "Automations live here." },
      controllerWith(3, button),
    );

    await vi.waitFor(() =>
      expect(useAiGuideStore.getState().step).toMatchObject({
        kind: "click",
        title: "Open Automate",
        tip: "Automations live here.",
        element: button,
      }),
    );
    fireEvent.click(label);

    await expect(pending).resolves.toMatch(/clicked element 3/);
  });

  it("sends a step back to the AI instead of showing a blank tip or a ring around nothing", async () => {
    const hidden = document.createElement("a");
    document.body.append(hidden); // zero-size box, like a hidden duplicate link
    const tools = createGuideTools(makeBridge());

    await expect(
      run(
        tools,
        "guide_click",
        { index: 1, title: "Open", tip: "" },
        controllerWith(1, hidden),
      ),
    ).resolves.toMatch(/^Rejected: every step needs/);
    await expect(
      run(
        tools,
        "guide_click",
        {
          index: 1,
          title: "Open Automate",
          tip: "Automations live on this page.",
        },
        controllerWith(1, hidden),
      ),
    ).resolves.toMatch(/^Rejected: element 1 is not visible/);

    expect(useAiGuideStore.getState().step).toBeNull();
  });

  it("falls back to an explanation when the element can't be found", async () => {
    const tools = createGuideTools(makeBridge());

    const pending = run(
      tools,
      "guide_click",
      { index: 9, title: "Open Automate", tip: "Automations live here." },
      { selectorMap: new Map() },
    );
    await vi.waitFor(() =>
      expect(useAiGuideStore.getState().step).toMatchObject({
        kind: "explain",
        element: null,
      }),
    );
    useAiGuideStore.getState().advance();

    await expect(pending).resolves.toMatch(/not found/);
  });

  it("only navigates to allowed routes", async () => {
    const tools = createGuideTools(makeBridge());

    await expect(
      run(tools, "go_to_page", { route: "https://evil.example" }),
    ).resolves.toMatch(/not allowed/);
    expect(navigate).not.toHaveBeenCalled();

    await run(tools, "go_to_page", { route: "/automations" });
    expect(navigate).toHaveBeenCalledWith("/automations");
  });

  it("finishes on a closing summary the user dismisses", async () => {
    const tools = createGuideTools(makeBridge());

    const pending = run(tools, "done", { text: "Your automation is ready." });
    await vi.waitFor(() =>
      expect(useAiGuideStore.getState().step).toMatchObject({
        kind: "done",
        title: "You're all set",
        tip: "Your automation is ready.",
      }),
    );
    useAiGuideStore.getState().advance();

    await expect(pending).resolves.toBe("Task completed");
  });

  it("scrubs emails, token-like strings and field values before the page reaches the model", () => {
    const redacted = redactPageContent(
      '[1]<input value="hunter2" /> owner jane@acme.com key ghp_abcdefghijklmnop1234 ok',
    );

    expect(redacted).not.toMatch(/hunter2|jane@acme\.com|ghp_/);
    expect(redacted).toContain("[1]<input value=[redacted]");
    expect(redacted).toContain("ok");
  });

  it("finds page-agent's element map where the pinned version keeps it", () => {
    // Guards the one private detail we depend on (see resolveIndexedElement):
    // an upgrade that renames the field must fail here, not silently in prod.
    const controller = new PageController({ enableMask: false });
    const button = document.createElement("button");
    (
      controller as unknown as { selectorMap: Map<number, unknown> }
    ).selectorMap.set(0, { ref: button });

    expect(resolveIndexedElement(controller, 0)).toBe(button);
  });
});
