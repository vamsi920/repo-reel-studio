import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import translations from "#/i18n/translation.json";
import { CONNECTOR_MANIFESTS } from "#/lib/environment/registry";
import { CAPABILITIES } from "#/lib/environment/types/capability";

const LOGO_DIR = resolve(process.cwd(), "src/lib/environment/logos");
const LOGO_FILES = new Set(readdirSync(LOGO_DIR));
const KEYS = new Set(Object.keys(translations as Record<string, unknown>));

/**
 * Registry integrity.
 *
 * Adding a connector is a data change, which is the point -- but it also means
 * a typo in a manifest ships as a broken card rather than a compile error.
 * These checks are what make "vendors are data" safe.
 */
describe("connector registry", () => {
  it("has unique ids", () => {
    const ids = CONNECTOR_MANIFESTS.map((manifest) => manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only declares known capabilities", () => {
    for (const manifest of CONNECTOR_MANIFESTS) {
      expect(CAPABILITIES).toContain(manifest.capability);
    }
  });

  it("references translation keys that exist", () => {
    const missing: string[] = [];
    const check = (key: string | undefined) => {
      if (key && !KEYS.has(key)) missing.push(key);
    };
    for (const manifest of CONNECTOR_MANIFESTS) {
      check(manifest.nameKey);
      check(manifest.descriptionKey);
      for (const field of manifest.fields) {
        check(field.labelKey);
        check(field.helpKey);
        check(field.placeholderKey);
        check(field.patternHintKey);
        for (const option of field.options ?? []) check(option.labelKey);
      }
      for (const host of manifest.egress) check(host.purposeKey);
      for (const probeCheck of manifest.probe.checks)
        check(probeCheck.labelKey);
      for (const value of Object.values(manifest.degradations ?? {}))
        check(value);
    }
    expect(missing).toEqual([]);
  });

  it("ships a local logo for every provider", () => {
    const missing = CONNECTOR_MANIFESTS.filter(
      (manifest) => !LOGO_FILES.has(manifest.logo),
    ).map((manifest) => manifest.id);
    expect(missing).toEqual([]);
  });

  it("uses compilable field patterns", () => {
    for (const manifest of CONNECTOR_MANIFESTS) {
      for (const field of manifest.fields) {
        if (!field.pattern) continue;
        expect(() => new RegExp(field.pattern as string)).not.toThrow();
      }
    }
  });

  /**
   * The rule that matters most. A URL carrying a credential is a credential
   * published to every proxy log and error report between here and the vendor.
   * The interpolator refuses it at runtime; this catches it at author time.
   */
  it("never interpolates a secret field into a URL", () => {
    const offenders: string[] = [];
    for (const manifest of CONNECTOR_MANIFESTS) {
      const secretNames = manifest.fields
        .filter((field) => field.secret)
        .map((field) => field.name);
      const urlTemplates = [
        manifest.hostOverride?.baseUrlTemplate,
        manifest.probe.request.pathTemplate,
        ...(manifest.operations ?? []).map(
          (operation) => operation.pathTemplate,
        ),
      ].filter(Boolean) as string[];

      for (const template of urlTemplates) {
        for (const name of secretNames) {
          if (template.includes(`{{${name}}}`)) {
            offenders.push(`${manifest.id}: ${name} in ${template}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives every proxied provider something to route", () => {
    // A provider whose traffic is supposed to go through our proxy but which
    // declares no operations is decorative: it can be connected and verified,
    // and then nothing can actually use it. Providers talked to by a client
    // SDK we do not intermediate declare `trafficPath: "direct"` and are
    // legitimately operation-free.
    const decorative = CONNECTOR_MANIFESTS.filter(
      (manifest) =>
        manifest.maturity === "ga" &&
        manifest.authKind !== "none" &&
        (manifest.trafficPath ?? "proxy") === "proxy" &&
        (manifest.operations ?? []).length === 0,
    ).map((manifest) => manifest.id);
    expect(decorative).toEqual([]);
  });
});
