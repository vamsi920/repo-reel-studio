import { describe, expect, it } from "vitest";
import {
  builtinScenarios,
  clampScenario,
  MAX_ROWS_PER_RUN,
  totalRows,
} from "#/lib/synth/scenarios";
import { generateDataset, datasetSummary } from "#/lib/synth/generate";
import { validateDataset } from "#/lib/synth/validate";
import {
  exportDataset,
  toCsv,
  toSql,
  toPrismaSeed,
  buildManifest,
} from "#/lib/synth/exporters";
import {
  maskRows,
  privacyReport,
  privacyReportMarkdown,
} from "#/lib/synth/privacy";
import { createRng, uuidFrom } from "#/lib/synth/rng";
import {
  inferSemantic,
  normalizeType,
  piiClassOf,
} from "#/lib/synth/semantics";
import { parseSchemaFile } from "#/lib/synth/parsers";
import {
  insertionOrder,
  modelHash,
  modelProblems,
  type DataModel,
  type Scenario,
} from "#/lib/synth/model";
import { PRISMA_SHOP, SQL_BLOG } from "./fixtures";

function shopModel(): DataModel {
  return {
    entities: parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
    rules: [],
    flows: [],
  };
}

function blogModel(): DataModel {
  return {
    entities: parseSchemaFile("schema.sql", SQL_BLOG).entities,
    rules: [],
    flows: [],
  };
}

const NOW = new Date("2026-10-21T12:00:00Z");

describe("rng", () => {
  it("is deterministic per seed and forks independent streams", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.int(1, 10), uuidFrom(a)]).toEqual([
      b.next(),
      b.int(1, 10),
      uuidFrom(b),
    ]);
    const f1 = createRng(42).fork("x").next();
    const f2 = createRng(42).fork("y").next();
    expect(f1).not.toBe(f2);
    expect(createRng("seed-text").seed).toBe(createRng("seed-text").seed);
  });

  it("skews parent popularity toward the first indices", () => {
    const rng = createRng(7);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 5000; i++) counts[rng.skewedIndex(10)] += 1;
    expect(counts[0]).toBeGreaterThan(counts[9] * 5);
  });
});

describe("semantics", () => {
  it.each([
    ["email", "string", "email"],
    ["billing_email", "string", "email"],
    ["first_name", "string", "first_name"],
    ["created_at", "datetime", "created_at"],
    ["price_cents", "integer", "price"],
    ["is_active", "boolean", "boolean"],
    ["country_code", "string", "country_code"],
    ["avatar_url", "string", "image_url"],
    ["status", "enum", "status"],
    ["view_count", "integer", "count"],
    ["notes", "text", "description"],
    ["payload", "json", "json"],
  ])("%s:%s → %s", (name, type, expected) => {
    expect(inferSemantic(name, type as never)).toBe(expected);
  });

  it("maps SQL/ORM type words onto field types", () => {
    expect(normalizeType("VARCHAR(255)")).toBe("string");
    expect(normalizeType("timestamptz")).toBe("datetime");
    expect(normalizeType("numeric(10,2)")).toBe("decimal");
    expect(normalizeType("jsonb")).toBe("json");
    expect(normalizeType("text[]")).toBe("array");
    expect(normalizeType("whatever")).toBe("unknown");
  });

  it("classifies personal data", () => {
    expect(piiClassOf({ name: "email", type: "string" })).toBe("direct");
    expect(piiClassOf({ name: "zip", type: "string" })).toBe("quasi");
    expect(piiClassOf({ name: "password_hash", type: "string" })).toBe(
      "sensitive",
    );
    expect(piiClassOf({ name: "sku", type: "string" })).toBe("none");
    expect(piiClassOf({ name: "sku", type: "string", pii: "direct" })).toBe(
      "direct",
    );
  });
});

describe("generator", () => {
  it("produces a valid dataset for a real Prisma schema with FKs, 1:1, self-reference and composite unique", () => {
    const model = shopModel();
    const scenario = builtinScenarios(model).find((s) => s.id === "realistic")!;
    const dataset = generateDataset(model, scenario, { seed: 1, now: NOW });
    const report = validateDataset(model, dataset);
    expect(report.checks.filter((c) => !c.passed)).toEqual([]);
    expect(report.ok).toBe(true);
    const summary = datasetSummary(dataset);
    expect(summary.total).toBe(totalRows(scenario, model));
    // Parents before children, so the SQL loads in one pass.
    const order = dataset.order;
    expect(order.indexOf("user")).toBeLessThan(order.indexOf("order"));
    expect(order.indexOf("order")).toBeLessThan(order.indexOf("order_item"));
    expect(order.indexOf("product")).toBeLessThan(order.indexOf("order_item"));
    // One-to-one: every profile points at a distinct user.
    const userIds = dataset.tables.profile
      .map((r) => r.userId)
      .filter((v) => v !== null);
    expect(new Set(userIds).size).toBe(userIds.length);
    // Self-reference: first category is a root; others point at earlier rows.
    expect(dataset.tables.category[0].parentId).toBeNull();
    // Enum values respected, decimals have two places.
    for (const row of dataset.tables.order) {
      expect(["PENDING", "PAID", "SHIPPED", "CANCELLED"]).toContain(row.status);
      expect(String(row.total)).toMatch(/^\d+(\.\d{1,2})?$/);
    }
    // Emails look like emails; names agree with each other.
    const user = dataset.tables.user[0];
    expect(String(user.email)).toMatch(/^[\w.+-]+@[\w.-]+$/);
    expect(dataset.warnings.filter((w) => !w.startsWith("cycle"))).toEqual([]);
  });

  it("is reproducible: same seed gives identical data, a different seed does not", () => {
    const model = blogModel();
    const scenario = builtinScenarios(model)[0];
    const a = generateDataset(model, scenario, { seed: 99, now: NOW });
    const b = generateDataset(model, scenario, { seed: 99, now: NOW });
    const c = generateDataset(model, scenario, { seed: 100, now: NOW });
    expect(a.tables).toEqual(b.tables);
    expect(a.tables).not.toEqual(c.tables);
    expect(a.modelHash).toBe(modelHash(model));
  });

  it("appends edge-case rows that still pass validation", () => {
    const model = blogModel();
    const scenario = builtinScenarios(model).find(
      (s) => s.id === "edge_cases",
    )!;
    const dataset = generateDataset(model, scenario, { seed: 3, now: NOW });
    expect(dataset.edgeRows.posts.length).toBeGreaterThan(0);
    const titles = dataset.edgeRows.posts.map((i) =>
      String(dataset.tables.posts[i].title),
    );
    expect(titles.some((t) => t.length === 200)).toBe(true);
    expect(validateDataset(model, dataset).ok).toBe(true);
  });

  it("enforces business rules and the validator confirms them", () => {
    const model = shopModel();
    model.rules = [
      {
        id: "shipped-has-date",
        entity: "order",
        description: "Shipped orders have a shipped_at",
        spec: {
          kind: "implies",
          if: { field: "status", in: ["SHIPPED"] },
          then: { field: "shippedAt", isNull: false },
        },
      },
      {
        id: "pending-no-date",
        entity: "order",
        description: "Pending orders have no shipped_at",
        spec: {
          kind: "implies",
          if: { field: "status", in: ["PENDING", "CANCELLED"] },
          then: { field: "shippedAt", isNull: true },
        },
      },
      {
        id: "shipped-after-placed",
        entity: "order",
        description: "shipped_at is after placed_at",
        spec: {
          kind: "compare",
          field: "shippedAt",
          op: ">=",
          other: "placedAt",
        },
      },
      {
        id: "qty-range",
        entity: "order_item",
        description: "quantity between 1 and 20",
        spec: { kind: "range", field: "quantity", min: 1, max: 20 },
      },
    ];
    const scenario: Scenario = {
      id: "orders",
      name: "Orders",
      counts: {
        user: 20,
        profile: 5,
        category: 4,
        product: 15,
        order: 120,
        order_item: 200,
      },
      overrides: [
        {
          entity: "order",
          field: "status",
          weights: { SHIPPED: 5, PENDING: 3, PAID: 2 },
        },
      ],
      parentDistribution: "skewed",
    };
    const dataset = generateDataset(model, scenario, { seed: 11, now: NOW });
    const report = validateDataset(model, dataset);
    expect(report.checks.filter((c) => !c.passed)).toEqual([]);
    const shipped = dataset.tables.order.filter((r) => r.status === "SHIPPED");
    expect(shipped.length).toBeGreaterThan(20);
    for (const row of shipped) {
      expect(row.shippedAt).not.toBeNull();
      expect(Date.parse(String(row.shippedAt))).toBeGreaterThanOrEqual(
        Date.parse(String(row.placedAt)),
      );
    }
    for (const row of dataset.tables.order.filter(
      (r) => r.status === "PENDING",
    ))
      expect(row.shippedAt).toBeNull();
    for (const row of dataset.tables.order_item) {
      expect(row.quantity).toBeGreaterThanOrEqual(1);
      expect(row.quantity).toBeLessThanOrEqual(20);
    }
    // Skew: the busiest user has many more orders than the median one.
    const perUser = new Map<unknown, number>();
    for (const row of dataset.tables.order)
      perUser.set(row.userId, (perUser.get(row.userId) ?? 0) + 1);
    const sorted = [...perUser.values()].sort((a, b) => b - a);
    expect(sorted[0]).toBeGreaterThan(
      sorted[Math.floor(sorted.length / 2)] * 2,
    );
  });

  it("uses recorded profiles (categorical weights) and honours ranges", () => {
    const model = blogModel();
    const posts = model.entities.find((e) => e.id === "posts")!;
    posts.fields.find((f) => f.name === "state")!.distribution = {
      kind: "categorical",
      weights: { published: 9, draft: 1 },
    };
    posts.fields.find((f) => f.name === "views")!.distribution = {
      kind: "uniform",
      min: 10,
      max: 20,
    };
    const dataset = generateDataset(
      model,
      { id: "p", name: "p", counts: { authors: 5, posts: 200, comments: 10 } },
      { seed: 5, now: NOW },
    );
    const published = dataset.tables.posts.filter(
      (r) => r.state === "published",
    ).length;
    expect(published).toBeGreaterThan(150);
    for (const row of dataset.tables.posts) {
      expect(row.views).toBeGreaterThanOrEqual(10);
      expect(row.views).toBeLessThanOrEqual(20);
    }
    expect(validateDataset(model, dataset).ok).toBe(true);
  });

  it("the validator catches what the generator cannot satisfy", () => {
    const model = shopModel();
    // Impossible: both branches force different nullability on every row.
    model.rules = [
      {
        id: "a",
        entity: "order",
        description: "a",
        spec: {
          kind: "implies",
          if: { field: "status", in: ["PAID"] },
          then: { field: "shippedAt", isNull: true },
        },
      },
    ];
    const dataset = generateDataset(model, builtinScenarios(model)[0], {
      seed: 1,
      now: NOW,
    });
    // Tamper: break a foreign key and a unique after generation.
    dataset.tables.order[0].userId = 999_999;
    dataset.tables.user[1].email = dataset.tables.user[0].email;
    const report = validateDataset(model, dataset);
    expect(report.ok).toBe(false);
    const failed = report.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toContain("foreign_key:order.userId");
    expect(failed).toContain("unique:user.email");
  });

  it("clamps oversized scenarios to the run limit and reports model problems", () => {
    const model = blogModel();
    const big = clampScenario(
      {
        id: "x",
        name: "x",
        counts: { authors: 10_000_000, posts: 10_000_000, comments: 10 },
      },
      model,
    );
    expect(totalRows(big, model)).toBeLessThanOrEqual(MAX_ROWS_PER_RUN);
    model.entities[1].fields.push({
      name: "ghost_id",
      type: "integer",
      references: { entity: "nope", field: "id" },
    });
    expect(modelProblems(model)).toContain(
      "posts.ghost_id: references unknown entity nope",
    );
    expect(insertionOrder(model)).toEqual(["authors", "posts", "comments"]);
  });
});

describe("exporters", () => {
  const model = shopModel();
  const dataset = generateDataset(model, builtinScenarios(model)[0], {
    seed: 2,
    now: NOW,
  });

  it("writes manifest, json per entity, csv, sql dialects, prisma seed and pytest fixtures", () => {
    const files = exportDataset(model, dataset, [
      "json",
      "csv",
      "sql_postgres",
      "sql_mysql",
      "sql_sqlite",
      "prisma_seed",
      "pytest_fixtures",
    ]);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("manifest.json");
    expect(paths).toContain("data/order.json");
    expect(paths).toContain("csv/order_item.csv");
    expect(paths).toContain("seed.postgres.sql");
    expect(paths).toContain("seed.mysql.sql");
    expect(paths).toContain("seed.sqlite.sql");
    expect(paths).toContain("prisma/seed.ts");
    expect(paths).toContain("conftest_synth.py");
    const manifest = buildManifest(dataset);
    expect(manifest.insertOrder).toEqual(dataset.order);
    expect(manifest.tables.user.rows).toBe(dataset.tables.user.length);
    expect(
      JSON.parse(files.find((f) => f.path === "data/user.json")!.content),
    ).toHaveLength(dataset.tables.user.length);
  });

  it("quotes CSV and SQL values safely", () => {
    const entity = {
      id: "t",
      name: "t",
      evidence: [],
      fields: [
        { name: "a", type: "string" as const },
        { name: "b", type: "integer" as const },
      ],
    };
    const csv = toCsv(entity, [
      { a: 'say "hi", friend', b: 1 },
      { a: null, b: 2 },
    ]);
    expect(csv).toBe('a,b\n"say ""hi"", friend",1\n,2\n');
    const sql = toSql(model, dataset, "postgres");
    expect(sql).toContain('INSERT INTO "users" ("id", "email"');
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("pg_get_serial_sequence('users', 'id')");
    const quoted = toSql(
      {
        entities: [{ ...entity, fields: [...entity.fields] }],
        rules: [],
        flows: [],
      },
      {
        ...dataset,
        order: ["t"],
        tables: { t: [{ a: "O'Brien \\ co", b: 1 }] },
      },
      "postgres",
    );
    expect(quoted).toContain("('O''Brien \\ co', 1)");
    expect(
      toSql(
        { entities: [entity], rules: [], flows: [] },
        {
          ...dataset,
          order: ["t"],
          tables: { t: [{ a: "O'Brien \\ co", b: 1 }] },
        },
        "mysql",
      ),
    ).toContain("('O''Brien \\\\ co', 1)");
    const mysql = toSql(model, dataset, "mysql");
    expect(mysql).toContain("INSERT INTO `users`");
    expect(mysql).toContain("SET FOREIGN_KEY_CHECKS = 0;");
    const sqlite = toSql(model, dataset, "sqlite");
    expect(sqlite).toContain("PRAGMA foreign_keys = OFF;");
    expect(toPrismaSeed(model, dataset)).toContain(
      "prisma.orderItem.createMany",
    );
  });
});

describe("privacy", () => {
  it("reports personal-data fields and masks values consistently", () => {
    const model = shopModel();
    const report = privacyReport(model);
    const direct = report.findings
      .filter((f) => f.pii === "direct")
      .map((f) => `${f.entity}.${f.field}`);
    expect(direct).toEqual(
      expect.arrayContaining([
        "user.email",
        "user.firstName",
        "user.lastName",
        "user.phone",
      ]),
    );
    expect(report.entitiesWithPii).toContain("user");
    expect(privacyReportMarkdown(report)).toContain(
      "| user | email | direct |",
    );
    const user = model.entities.find((e) => e.id === "user")!;
    const rows = [
      {
        id: 1,
        email: "real.person@corp.com",
        firstName: "Real",
        lastName: "Person",
        phone: "+1555",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: 2,
        email: "real.person@corp.com",
        firstName: "Other",
        lastName: "One",
        phone: null,
        createdAt: "2026-01-02T00:00:00Z",
      },
    ];
    const { rows: masked, masked: count } = maskRows(user, rows, "s", NOW);
    expect(count).toBeGreaterThan(0);
    expect(masked[0].email).not.toBe("real.person@corp.com");
    // Same original value → same synthetic value (joins survive).
    expect(masked[0].email).toBe(masked[1].email);
    expect(masked[0].id).toBe(1);
    expect(masked[1].phone).toBeNull();
    expect(masked[0].createdAt).toBe("2026-01-01T00:00:00Z");
  });
});

describe("values always match the declared type (jevy-local-poc regression)", () => {
  it("keys from a list, numbers in number columns, text in text columns", () => {
    const model: DataModel = {
      entities: [
        {
          id: "estates",
          name: "estates",
          evidence: [],
          fields: [
            {
              name: "estate_id",
              type: "enum",
              primaryKey: true,
              enumValues: ["EST-1", "EST-2", "EST-3", "EST-4"],
            },
            { name: "estate_name", type: "string" },
          ],
        },
        {
          id: "servers",
          name: "servers",
          evidence: [],
          fields: [
            { name: "id", type: "integer", primaryKey: true },
            {
              name: "estate_id",
              type: "enum",
              enumValues: ["EST-1", "EST-2", "EST-3", "EST-4"],
              references: { entity: "estates", field: "estate_id" },
            },
            // A meaning that yields text, on an integer column.
            { name: "memory_gb", type: "integer", semantic: "description" },
            // A numeric profile on a text column.
            {
              name: "cost_center",
              type: "string",
              distribution: { kind: "normal", mean: 40, stddev: 5 },
            },
          ],
        },
      ],
      rules: [],
      flows: [],
    };
    for (const scenario of builtinScenarios(model)) {
      const dataset = generateDataset(
        model,
        { ...scenario, counts: { estates: 8, servers: 30 } },
        { seed: 3, now: new Date("2026-06-01T00:00:00Z") },
      );
      const report = validateDataset(model, dataset);
      expect(
        report.checks.filter((c) => !c.passed).map((c) => c.label),
      ).toEqual([]);
      expect(dataset.tables.estates).toHaveLength(4);
      for (const row of dataset.tables.servers) {
        expect(typeof row.memory_gb).toBe("number");
        if (row.cost_center !== null)
          expect(typeof row.cost_center).toBe("string");
      }
    }
  });
});
