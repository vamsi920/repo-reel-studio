import { describe, expect, it } from "vitest";
import {
  detectSchemaFormat,
  parseJsonSchema,
  parsePrisma,
  parseSchemaFile,
  parseSql,
} from "#/lib/synth/parsers";
import { modelProblems, relationsOf } from "#/lib/synth/model";
import { OPENAPI_PETS, PRISMA_SHOP, SQL_BLOG } from "./fixtures";

function field(
  entities: ReturnType<typeof parsePrisma>["entities"],
  entity: string,
  name: string,
) {
  const e = entities.find((x) => x.id === entity);
  if (!e) throw new Error(`no entity ${entity}`);
  const f = e.fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${entity}.${name}`);
  return f;
}

describe("prisma parser", () => {
  const { entities, warnings } = parsePrisma(PRISMA_SHOP);

  it("reads models, enums, maps, keys, relations and composite uniques", () => {
    expect(warnings).toEqual([]);
    expect(entities.map((e) => e.id)).toEqual([
      "user",
      "profile",
      "category",
      "product",
      "order",
      "order_item",
    ]);
    expect(entities.find((e) => e.id === "user")?.table).toBe("users");
    expect(field(entities, "user", "email")).toMatchObject({
      type: "string",
      unique: true,
      maxLength: 255,
    });
    expect(field(entities, "user", "id")).toMatchObject({
      primaryKey: true,
      generated: true,
      type: "integer",
    });
    expect(field(entities, "profile", "id").type).toBe("uuid");
    expect(field(entities, "order", "status")).toMatchObject({
      type: "enum",
      enumValues: ["PENDING", "PAID", "SHIPPED", "CANCELLED"],
    });
    expect(field(entities, "order", "total")).toMatchObject({
      type: "decimal",
      scale: 2,
    });
    expect(field(entities, "order", "shippedAt").nullable).toBe(true);
    // Relation fields become FKs on the scalar; back-references (Order[]) are not fields.
    expect(field(entities, "order", "userId").references).toEqual({
      entity: "user",
      field: "id",
    });
    expect(field(entities, "profile", "userId")).toMatchObject({
      unique: true,
      references: { entity: "user", field: "id" },
    });
    expect(field(entities, "category", "parentId").references).toEqual({
      entity: "category",
      field: "id",
    });
    expect(
      entities.find((e) => e.id === "user")?.fields.map((f) => f.name),
    ).not.toContain("orders");
    expect(entities.find((e) => e.id === "order_item")?.uniqueTogether).toEqual(
      [["orderId", "productId"]],
    );
    expect(modelProblems({ entities, rules: [], flows: [] })).toEqual([]);
    expect(relationsOf({ entities, rules: [], flows: [] })).toHaveLength(6);
  });
});

describe("sql parser", () => {
  const { entities, warnings } = parseSql(SQL_BLOG);

  it("reads tables, column constraints, pg enums, checks, table-level and ALTER foreign keys", () => {
    expect(entities.map((e) => e.id)).toEqual(["authors", "posts", "comments"]);
    expect(field(entities, "authors", "id")).toMatchObject({
      primaryKey: true,
      generated: true,
      type: "integer",
    });
    expect(field(entities, "authors", "username")).toMatchObject({
      unique: true,
      nullable: false,
      maxLength: 40,
    });
    expect(field(entities, "authors", "country_code")).toMatchObject({
      type: "string",
      nullable: true,
      maxLength: 2,
    });
    expect(field(entities, "authors", "created_at")).toMatchObject({
      type: "datetime",
      generated: true,
    });
    expect(field(entities, "posts", "state")).toMatchObject({
      type: "enum",
      enumValues: ["draft", "published", "archived"],
    });
    expect(field(entities, "posts", "author_id").references).toEqual({
      entity: "authors",
      field: "id",
    });
    expect(entities.find((e) => e.id === "posts")?.uniqueTogether).toEqual([
      ["author_id", "slug"],
    ]);
    expect(field(entities, "comments", "rating")).toMatchObject({
      type: "enum",
      enumValues: ["1", "2", "3", "4", "5"],
    });
    expect(field(entities, "comments", "post_id").references).toEqual({
      entity: "posts",
      field: "id",
    });
    expect(field(entities, "comments", "author_id")).toMatchObject({
      nullable: true,
      references: { entity: "authors", field: "id" },
    });
    expect(warnings).toEqual([]);
    expect(modelProblems({ entities, rules: [], flows: [] })).toEqual([]);
  });

  it("reports a file without tables instead of throwing", () => {
    const result = parseSql("SELECT 1;", "q.sql");
    expect(result.entities).toEqual([]);
    expect(result.warnings[0]).toMatch(/no CREATE TABLE/);
  });
});

describe("json schema / openapi parser", () => {
  const { entities, warnings, format } = parseJsonSchema(
    OPENAPI_PETS,
    "openapi.json",
  );

  it("turns component schemas into entities, $ref objects into foreign keys and skips has-many arrays", () => {
    expect(format).toBe("openapi");
    expect(entities.map((e) => e.id)).toEqual([
      "owner",
      "pet",
      "visit",
      "error",
    ]);
    expect(field(entities, "owner", "id")).toMatchObject({
      type: "uuid",
      primaryKey: true,
    });
    expect(field(entities, "owner", "email")).toMatchObject({
      semantic: "email",
      maxLength: 254,
      nullable: false,
    });
    expect(field(entities, "owner", "website")).toMatchObject({
      semantic: "url",
      nullable: true,
    });
    expect(field(entities, "owner", "age")).toMatchObject({
      type: "integer",
      min: 18,
      max: 120,
    });
    expect(field(entities, "pet", "species")).toMatchObject({
      type: "enum",
      enumValues: ["dog", "cat", "bird"],
    });
    expect(field(entities, "pet", "weightKg")).toMatchObject({
      type: "float",
      min: 0.1,
      max: 90,
    });
    expect(field(entities, "pet", "owner_id").references).toEqual({
      entity: "owner",
      field: "id",
    });
    expect(field(entities, "pet", "tags").type).toBe("array");
    expect(
      entities.find((e) => e.id === "pet")?.fields.map((f) => f.name),
    ).not.toContain("visits");
    expect(field(entities, "pet", "bornOn")).toMatchObject({
      type: "date",
      nullable: true,
    });
    expect(field(entities, "visit", "pet_id").references).toEqual({
      entity: "pet",
      field: "id",
    });
    expect(warnings).toEqual([]);
  });

  it("rejects non-JSON clearly", () => {
    const result = parseJsonSchema("openapi: 3.0.0\n", "openapi.yaml");
    expect(result.entities).toEqual([]);
    expect(result.warnings[0]).toMatch(/not valid JSON/);
  });
});

describe("format detection", () => {
  it.each([
    ["prisma/schema.prisma", "model X { id Int @id }", "prisma"],
    ["db/migrations/001.sql", "create table t (id int)", "sql"],
    ["openapi.json", '{"openapi":"3.0.0"}', "openapi"],
    ["user.schema.json", '{"type":"object"}', "json-schema"],
    ["notes.txt", "hello", null],
    ["unknown", "datasource db {}\nmodel A { id Int @id }", "prisma"],
  ])("%s → %s", (path, content, expected) => {
    expect(detectSchemaFormat(path, content)).toBe(expected);
  });

  it("parseSchemaFile infers semantics on every field", () => {
    const { entities } = parseSchemaFile("schema.prisma", PRISMA_SHOP);
    for (const e of entities)
      for (const f of e.fields) expect(f.semantic).toBeDefined();
    expect(field(entities, "user", "email").semantic).toBe("email");
    expect(field(entities, "user", "firstName").semantic).toBe("first_name");
    expect(field(entities, "product", "priceCents").semantic).toBe("price");
    expect(field(entities, "order", "placedAt").semantic).toBe("date_past");
  });
});
