import { describe, expect, it, vi } from "vitest";
import { buildAutomationMenuItems } from "#/components/features/automations/build-automation-menu-items";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";

const t = (key: I18nKey) => key;

const automation: Automation = {
  id: "automation-1",
  name: "Async Standup Digest",
  enabled: true,
  trigger: { type: "cron", schedule: "0 9 * * *" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  prompt: null,
};

function baseOptions(overrides: Partial<Parameters<typeof buildAutomationMenuItems>[0]> = {}) {
  return {
    automation,
    t,
    canManage: true,
    onRunNow: vi.fn(),
    isRunPending: false,
    onView: vi.fn(),
    onExport: vi.fn(),
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("buildAutomationMenuItems", () => {
  it("includes run/edit/toggle/delete entries alongside view and export when the caller can manage", () => {
    const items = buildAutomationMenuItems(baseOptions());
    const labels = items.map((item) => item.label);
    expect(labels).toEqual([
      I18nKey.AUTOMATIONS$RUN_NOW,
      I18nKey.COMMON$VIEW,
      I18nKey.AUTOMATIONS$EXPORT,
      I18nKey.AUTOMATIONS$EDIT,
      I18nKey.AUTOMATIONS$TURN_OFF,
      I18nKey.AUTOMATIONS$DELETE,
    ]);
  });

  it("hides run/edit/toggle/delete entries when the caller cannot manage automations, keeping only view and export", () => {
    const items = buildAutomationMenuItems(baseOptions({ canManage: false }));
    expect(items.map((item) => item.label)).toEqual([
      I18nKey.COMMON$VIEW,
      I18nKey.AUTOMATIONS$EXPORT,
    ]);
  });

  it("omits the edit entry when no onEdit handler is provided, even when the caller can manage", () => {
    const items = buildAutomationMenuItems(baseOptions({ onEdit: undefined }));
    expect(items.some((item) => item.label === I18nKey.AUTOMATIONS$EDIT)).toBe(
      false,
    );
  });

  it("labels the toggle entry Turn On for a disabled automation and Turn Off for an enabled one", () => {
    const disabledItems = buildAutomationMenuItems(
      baseOptions({ automation: { ...automation, enabled: false } }),
    );
    expect(
      disabledItems.find((item) => item.icon && item.label.includes("TURN")),
    ).toMatchObject({ label: I18nKey.AUTOMATIONS$TURN_ON });

    const enabledItems = buildAutomationMenuItems(baseOptions());
    expect(
      enabledItems.find((item) => item.label.includes("TURN")),
    ).toMatchObject({ label: I18nKey.AUTOMATIONS$TURN_OFF });
  });

  it("disables the Run Now entry while a run is pending or the automation is off", () => {
    const runPending = buildAutomationMenuItems(
      baseOptions({ isRunPending: true }),
    );
    expect(
      runPending.find((item) => item.label === I18nKey.AUTOMATIONS$RUN_NOW),
    ).toMatchObject({ disabled: true });

    const disabledAutomation = buildAutomationMenuItems(
      baseOptions({ automation: { ...automation, enabled: false } }),
    );
    expect(
      disabledAutomation.find(
        (item) => item.label === I18nKey.AUTOMATIONS$RUN_NOW,
      ),
    ).toMatchObject({ disabled: true });
  });

  it("wires each entry's onClick to the corresponding callback with the automation id", () => {
    const onRunNow = vi.fn();
    const onView = vi.fn();
    const onExport = vi.fn();
    const onEdit = vi.fn();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const items = buildAutomationMenuItems(
      baseOptions({ onRunNow, onView, onExport, onEdit, onToggle, onDelete }),
    );

    items.find((item) => item.label === I18nKey.AUTOMATIONS$RUN_NOW)?.onClick();
    expect(onRunNow).toHaveBeenCalledWith(automation.id);

    items.find((item) => item.label === I18nKey.COMMON$VIEW)?.onClick();
    expect(onView).toHaveBeenCalledTimes(1);

    items.find((item) => item.label === I18nKey.AUTOMATIONS$EXPORT)?.onClick();
    expect(onExport).toHaveBeenCalledWith(automation);

    items.find((item) => item.label === I18nKey.AUTOMATIONS$EDIT)?.onClick();
    expect(onEdit).toHaveBeenCalledWith(automation.id);

    items
      .find((item) => item.label === I18nKey.AUTOMATIONS$TURN_OFF)
      ?.onClick();
    expect(onToggle).toHaveBeenCalledWith(automation.id, automation.enabled);

    items.find((item) => item.label === I18nKey.AUTOMATIONS$DELETE)?.onClick();
    expect(onDelete).toHaveBeenCalledWith(automation.id);
  });
});
