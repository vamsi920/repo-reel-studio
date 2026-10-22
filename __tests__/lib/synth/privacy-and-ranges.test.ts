import { describe, expect, it } from "vitest";
import { generateDataset } from "#/lib/synth/generate";
import { validateDataset } from "#/lib/synth/validate";
import { toSql } from "#/lib/synth/exporters";
import {
  entityForColumns,
  maskRows,
  maskValue,
  parseCsv,
  parseTabular,
  privacyReport,
} from "#/lib/synth/privacy";
import { scaleToTotal, totalRows } from "#/lib/synth/scenarios";
import { withInferredSemantics } from "#/lib/synth/semantics";
import type { DataModel, Entity, Scenario } from "#/lib/synth/model";

const NOW = new Date("2026-10-22T12:00:00Z");

function customers(overrides: Partial<Record<string, object>> = {}): Entity {
  return withInferredSemantics({
    id: "customers",
    name: "customers",
    evidence: [],
    fields: [
      { name: "id", type: "integer", primaryKey: true, generated: true },
      { name: "email", type: "string", unique: true, maxLength: 255 },
      { name: "ssn", type: "string", unique: true, ...overrides.ssn },
      { name: "phone", type: "string", nullable: true, ...overrides.phone },
      { name: "card_number", type: "string", ...overrides.card },
      { name: "tax_id", type: "string" },
      { name: "last_ip", type: "string" },
      { name: "code", type: "string", maxLength: 10 },
      { name: "tier", type: "string", ...overrides.tier },
      { name: "signup", type: "datetime" },
      { name: "active", type: "boolean" },
    ],
  });
}

function run(entity: Entity, rows = 200) {
  const model: DataModel = { entities: [entity], rules: [], flows: [] };
  const scenario: Scenario = {
    id: "s",
    name: "s",
    counts: { customers: rows },
  };
  const dataset = generateDataset(model, scenario, { seed: 4, now: NOW });
  return { model, dataset, rows: dataset.tables.customers };
}

describe("identifiers come from ranges that are never issued for real", () => {
  it("SSNs, phones, cards, tax ids and IPs all stay inside reserved ranges", () => {
    const { rows } = run(customers());
    for (const row of rows) {
      expect(row.ssn).toMatch(/^9\d\d-00-\d{4}$/);
      if (row.phone !== null)
        expect(row.phone).toMatch(/^\+1[2-9]\d\d55501\d\d$/);
      expect([
        "4111111111111111",
        "4012888888881881",
        "4242424242424242",
        "5555555555554444",
        "5105105105105100",
        "378282246310005",
        "6011111111111117",
      ]).toContain(row.card_number);
      expect(row.tax_id).toMatch(/^00-\d{7}$/);
      expect(row.last_ip).toMatch(
        /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/,
      );
      expect(String(row.email)).toMatch(
        /@(example\.(com|org|net)|mail\.example|test\.example)$/,
      );
    }
  });

  it("a short varchar of unknown meaning gets lengths across its whole range", () => {
    const { rows } = run(customers());
    const lengths = new Set(rows.map((r) => String(r.code).length));
    expect(Math.max(...lengths)).toBeLessThanOrEqual(10);
    expect(lengths.size).toBeGreaterThanOrEqual(6);
  });

  it("example values the user gave a column are what rows contain", () => {
    const { rows } = run(
      customers({ tier: { examples: ["gold", "silver", "bronze"] } }),
    );
    expect(new Set(rows.map((r) => r.tier))).toEqual(
      new Set(["gold", "silver", "bronze"]),
    );
  });
});

describe("mask / redact choices", () => {
  it("are applied to generated data, and validation skips uniqueness on treated columns", () => {
    const { model, dataset, rows } = run(
      customers({ ssn: { treatment: "mask" }, phone: { treatment: "redact" } }),
    );
    for (const row of rows) {
      expect(row.ssn).toMatch(/^\*\*\*-\*\*-\d{4}$/);
      if (row.phone !== null) expect(row.phone).toBe("[REDACTED]");
    }
    expect(dataset.warnings).toContain(
      "customers.ssn: masked, generalized or redacted, so values are not kept unique (pseudonymize keeps them unique)",
    );
    const report = validateDataset(model, dataset);
    expect(report.checks.some((c) => c.id === "unique:customers.ssn")).toBe(
      false,
    );
    expect(report.ok).toBe(true);
  });

  it("keys are never treated and a non-text non-nullable column cannot be redacted", () => {
    const entity = customers();
    entity.fields[0].treatment = "redact";
    entity.fields[9] = {
      ...entity.fields[9],
      pii: "sensitive",
      treatment: "redact",
    };
    const { rows } = run(entity, 20);
    expect(rows.every((r) => typeof r.id === "number")).toBe(true);
    expect(rows.every((r) => typeof r.signup === "string")).toBe(true);
  });

  it("the privacy report lists high-risk identifiers nobody decided on", () => {
    const report = privacyReport({
      entities: [customers({ ssn: { treatment: "mask" } })],
      rules: [],
      flows: [],
    });
    expect(report.undecided.map((u) => u.field)).toEqual([
      "card_number",
      "tax_id",
    ]);
    expect(report.strategies.mask).toBe(1);
  });

  it("maskValue keeps the last four characters and email domains", () => {
    expect(maskValue("123-45-6789")).toBe("***-**-6789");
    expect(maskValue("jane.doe@corp.com")).toBe("j***@corp.com");
    expect(maskValue("abc")).toBe("***");
  });
});

describe("masking a real export", () => {
  it("reads CSV with quotes, commas and blank cells", () => {
    const csv = 'id,email,note\r\n1,"a@b.com","said ""hi"", twice"\n2,,plain\n';
    expect(parseCsv(csv)).toEqual({
      columns: ["id", "email", "note"],
      rows: [
        { id: "1", email: "a@b.com", note: 'said "hi", twice' },
        { id: "2", email: null, note: "plain" },
      ],
    });
    expect(parseTabular('[{"a":1},{"b":2}]')?.columns).toEqual(["a", "b"]);
    expect(parseTabular("not tabular")?.rows).toEqual([]);
  });

  it("replaces personal columns per choice, consistently, and judges unknown columns by name", () => {
    const base = customers({
      ssn: { treatment: "mask" },
      phone: { treatment: "redact" },
    });
    const { entity, unknownColumns } = entityForColumns(base, [
      "id",
      "email",
      "ssn",
      "phone",
      "home_email",
      "notes",
    ]);
    expect(unknownColumns).toEqual(["home_email", "notes"]);
    const real = [
      {
        id: "7",
        email: "real.person@corp.com",
        ssn: "123-45-6789",
        phone: "+15551234567",
        home_email: "me@home.net",
        notes: "vip",
      },
      {
        id: "8",
        email: "real.person@corp.com",
        ssn: "987-65-4321",
        phone: null,
        home_email: "you@home.net",
        notes: "new",
      },
    ];
    const { rows, masked, perField } = maskRows(entity, real, "project-1", NOW);
    expect(rows[0].id).toBe("7");
    expect(rows[0].email).not.toBe("real.person@corp.com");
    expect(rows[0].email).toBe(rows[1].email);
    expect(rows[0].ssn).toBe("***-**-6789");
    expect(rows[0].phone).toBe("[REDACTED]");
    expect(rows[1].phone).toBeNull();
    expect(rows[0].home_email).not.toBe("me@home.net");
    expect(rows[0].notes).toBe("vip");
    expect(perField).toEqual({ email: 2, ssn: 2, phone: 1, home_email: 2 });
    expect(masked).toBe(7);
  });
});

describe("SQL Server and Oracle exports", () => {
  const { model, dataset } = run(customers(), 3);

  it("SQL Server: bracketed names, N'' strings, bit booleans, identity insert, constraint checks", () => {
    const sql = toSql(model, dataset, "sqlserver");
    expect(sql).toContain("BEGIN TRANSACTION;");
    expect(sql).toContain("ALTER TABLE [customers] NOCHECK CONSTRAINT ALL;");
    expect(sql).toContain("SET IDENTITY_INSERT [customers] ON;");
    expect(sql).toMatch(/INSERT INTO \[customers\] \(\[id\], \[email\]/);
    expect(sql).toMatch(/N'[^']+@/);
    expect(sql).toMatch(/, [01]\)/);
    expect(sql).not.toMatch(/T\d\d:\d\d:\d\d(\.\d+)?Z'/);
    expect(sql).toContain("COMMIT TRANSACTION;");
  });

  it("Oracle: one INSERT per row, unquoted names, TIMESTAMP literals, COMMIT", () => {
    const sql = toSql(model, dataset, "oracle");
    expect(sql.match(/^INSERT INTO customers \(id, email/gm)).toHaveLength(3);
    expect(sql).toMatch(/TIMESTAMP '\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});

describe("total rows", () => {
  it("resizes a scenario keeping the ratio between tables", () => {
    const model: DataModel = {
      entities: [
        {
          id: "users",
          name: "users",
          evidence: [],
          fields: [{ name: "id", type: "integer", primaryKey: true }],
        },
        {
          id: "orders",
          name: "orders",
          evidence: [],
          fields: [
            { name: "id", type: "integer", primaryKey: true },
            {
              name: "user_id",
              type: "integer",
              references: { entity: "users", field: "id" },
            },
          ],
        },
      ],
      rules: [],
      flows: [],
    };
    const scaled = scaleToTotal(
      { id: "s", name: "s", counts: { users: 10, orders: 30 } },
      model,
      4000,
    );
    expect(scaled.counts).toEqual({ users: 1000, orders: 3000 });
    expect(totalRows(scale(10_000_000), model)).toBeLessThanOrEqual(250_000);
    function scale(n: number) {
      return scaleToTotal(
        { id: "s", name: "s", counts: { users: 10, orders: 30 } },
        model,
        n,
      );
    }
  });
});

describe("total rows is exact", () => {
  it("hands rounding drift to the biggest table", () => {
    const model: DataModel = {
      entities: ["a", "b", "c", "d"].map((id) => ({
        id,
        name: id,
        evidence: [],
        fields: [{ name: "id", type: "integer" as const, primaryKey: true }],
      })),
      rules: [],
      flows: [],
    };
    const scaled = scaleToTotal(
      { id: "s", name: "s", counts: { a: 8, b: 8, c: 24, d: 16 } },
      model,
      1000,
    );
    expect(totalRows(scaled, model)).toBe(1000);
  });
});
