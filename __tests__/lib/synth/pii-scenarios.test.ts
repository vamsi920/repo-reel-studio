import { describe, expect, it } from "vitest";
import {
  inferSemantic,
  piiClassOf,
  withInferredSemantics,
} from "#/lib/synth/semantics";
import { detectColumnSemantic, scrubFreeText } from "#/lib/synth/pii-detect";
import { generateDataset } from "#/lib/synth/generate";
import { validateDataset } from "#/lib/synth/validate";
import {
  entityForColumns,
  generalizeValue,
  maskRows,
  parseTabular,
  privacyReport,
} from "#/lib/synth/privacy";
import {
  inferEntityFromSample,
  linkReferencesByName,
} from "#/lib/synth/sample";
import { parseSchemaFile } from "#/lib/synth/parsers";
import type {
  DataModel,
  Entity,
  Field,
  FieldType,
  Scenario,
} from "#/lib/synth/model";

const NOW = new Date("2026-10-22T12:00:00Z");

describe("every kind of personal data is recognised by its column name", () => {
  it.each<[string, FieldType, string, string]>([
    ["ssn", "string", "ssn", "direct"],
    ["social_security_number", "string", "ssn", "direct"],
    ["sin", "string", "national_id", "direct"],
    ["nino", "string", "national_id", "direct"],
    ["aadhaar_number", "string", "national_id", "direct"],
    ["passport_no", "string", "passport_number", "direct"],
    ["drivers_license_number", "string", "drivers_license", "direct"],
    ["vat_number", "string", "tax_id", "direct"],
    ["pan_number", "string", "tax_id", "direct"],
    ["iban", "string", "iban", "direct"],
    ["account_number", "string", "bank_account", "direct"],
    ["routing_number", "string", "routing_number", "quasi"],
    ["card_number", "string", "card_number", "direct"],
    ["card_expiry", "string", "card_expiry", "sensitive"],
    ["cvv", "integer", "card_cvv", "sensitive"],
    ["pin", "string", "pin", "sensitive"],
    ["credit_score", "integer", "credit_score", "sensitive"],
    ["annual_salary", "decimal", "amount", "sensitive"],
    ["password", "string", "password_hash", "sensitive"],
    ["mother_maiden_name", "string", "security_answer", "sensitive"],
    ["mrn", "string", "medical_record_number", "direct"],
    ["patient_id", "string", "medical_record_number", "direct"],
    ["insurance_member_id", "string", "insurance_number", "direct"],
    ["diagnosis", "string", "health_condition", "sensitive"],
    ["medications", "text", "health_condition", "sensitive"],
    ["blood_type", "string", "blood_type", "sensitive"],
    ["fingerprint_template", "bytes", "biometric", "sensitive"],
    ["face_embedding", "json", "json", "sensitive"],
    ["gender", "string", "gender", "quasi"],
    ["ethnicity", "string", "special_category", "sensitive"],
    ["religion", "string", "special_category", "sensitive"],
    ["sexual_orientation", "string", "special_category", "sensitive"],
    ["criminal_record", "text", "special_category", "sensitive"],
    ["mac_address", "string", "mac_address", "direct"],
    ["imei", "string", "device_id", "direct"],
    ["advertising_id", "string", "device_id", "direct"],
    ["user_agent", "string", "user_agent", "quasi"],
    ["client_ip", "string", "ip_address", "direct"],
    ["vin", "string", "vin", "direct"],
    ["license_plate", "string", "license_plate", "direct"],
    ["employee_id", "string", "employee_id", "quasi"],
    ["student_number", "string", "student_id", "quasi"],
    ["marital_status", "string", "marital_status", "quasi"],
    ["nationality", "string", "nationality", "quasi"],
    ["date_of_death", "date", "date_of_death", "quasi"],
    ["dob", "date", "birthdate", "quasi"],
    ["geo_location", "string", "geolocation", "quasi"],
    ["linkedin_url", "string", "social_profile", "direct"],
    ["mobile", "string", "phone", "direct"],
    ["billing_address", "string", "street", "direct"],
    ["middle_name", "string", "first_name", "direct"],
    ["maiden_name", "string", "last_name", "direct"],
    ["emergency_contact_name", "string", "full_name", "direct"],
    ["pincode", "string", "postal_code", "quasi"],
    // Not personal, although the words overlap
    ["email_count", "integer", "count", "none"],
    ["phone_verified", "boolean", "boolean", "none"],
    ["account_count", "integer", "count", "none"],
    ["status", "string", "status", "none"],
  ])("%s (%s) → %s / %s", (name, type, semantic, cls) => {
    const field: Field = { name, type, semantic: inferSemantic(name, type) };
    expect(field.semantic).toBe(semantic);
    expect(piiClassOf(field)).toBe(cls);
  });

  it("special-category flags are sensitive even as booleans", () => {
    expect(
      piiClassOf({
        name: "has_disability",
        type: "boolean",
        semantic: "boolean",
      }),
    ).toBe("sensitive");
    expect(
      piiClassOf({
        name: "is_union_member",
        type: "boolean",
        semantic: "boolean",
      }),
    ).toBe("sensitive");
  });

  it("a thing's name is not a person's name", () => {
    expect(
      withInferredSemantics({
        name: "products",
        fields: [{ name: "name", type: "string" } as Field],
      }).fields[0].semantic,
    ).toBe("title");
    expect(
      withInferredSemantics({
        name: "customers",
        fields: [{ name: "name", type: "string" } as Field],
      }).fields[0].semantic,
    ).toBe("full_name");
  });

  it("column comments reveal meaning the name hides (SQL COMMENT, COMMENT ON, Prisma ///)", () => {
    const sql = parseSchemaFile(
      "s.sql",
      "CREATE TABLE people (id INT PRIMARY KEY, c7 VARCHAR(11) COMMENT 'customer social security number', c8 VARCHAR(40));\nCOMMENT ON COLUMN people.c8 IS 'Passport number of the traveller';",
    ).entities[0];
    expect(sql.fields.find((f) => f.name === "c7")).toMatchObject({
      semantic: "ssn",
      description: "customer social security number",
    });
    expect(sql.fields.find((f) => f.name === "c8")?.semantic).toBe(
      "passport_number",
    );
    const prisma = parseSchemaFile(
      "schema.prisma",
      'datasource db { provider = "postgresql" url = env("DB") }\nmodel Patient {\n  id Int @id\n  /// ICD-10 diagnosis of the visit\n  code String\n  // ordinary comment\n  ref String\n}',
    ).entities[0];
    expect(prisma.fields.find((f) => f.name === "code")).toMatchObject({
      semantic: "health_condition",
      description: "ICD-10 diagnosis of the visit",
    });
    expect(
      prisma.fields.find((f) => f.name === "ref")?.description,
    ).toBeUndefined();
  });
});

describe("personal data is recognised by its values", () => {
  it.each<[string, unknown[], string | null]>([
    ["emails", ["a@b.com", "x.y@corp.co.uk", "z@q.io"], "email"],
    ["SSNs", ["123-45-6789", "987-65-4321"], "ssn"],
    [
      "Luhn-valid cards",
      ["4111 1111 1111 1111", "5555555555554444"],
      "card_number",
    ],
    ["IBANs", ["GB82WEST12345698765432", "DE89370400440532013000"], "iban"],
    [
      "phones",
      ["+1 212 555 0100", "(415) 555-0199", "+44 20 7946 0958"],
      "phone",
    ],
    ["IPs", ["10.0.0.1", "192.168.1.20"], "ip_address"],
    ["MACs", ["00:1A:2B:3C:4D:5E", "a4-5e-60-c2-11-0f"], "mac_address"],
    ["order numbers", ["12345", "67890", "11111"], null],
    ["mostly not emails", ["a@b.com", "hello", "world", "x"], null],
  ])("%s", (_label, values, expected) => {
    expect(detectColumnSemantic(values)).toBe(expected);
  });

  it("finds personal data inside free text without touching ordinary numbers", () => {
    const { text, found } = scrubFreeText(
      "Call Jane on +1 212 555 0100 or jane@corp.com; SSN 123-45-6789, card 4111 1111 1111 1111, IP 10.1.2.3. Order 12345 shipped 2026-01-05.",
    );
    expect(found).toBe(5);
    expect(text).toBe(
      "Call Jane on [phone] or [email]; SSN [ssn], card [card], IP [ip]. Order 12345 shipped 2026-01-05.",
    );
  });
});

function piiEntity(): Entity {
  const names: [string, FieldType][] = [
    ["passport_no", "string"],
    ["routing_number", "string"],
    ["swift_code", "string"],
    ["mac_address", "string"],
    ["imei", "string"],
    ["vin", "string"],
    ["mrn", "string"],
    ["insurance_member_id", "string"],
    ["drivers_license_number", "string"],
    ["account_number", "string"],
    ["diagnosis_code", "string"],
    ["blood_type", "string"],
    ["religion", "string"],
    ["card_expiry", "string"],
    ["cvv", "string"],
    ["credit_score", "integer"],
    ["gender", "string"],
    ["date_of_death", "date"],
    ["user_agent", "string"],
    ["linkedin_url", "string"],
  ];
  return withInferredSemantics({
    id: "people",
    name: "people",
    evidence: [],
    fields: [
      { name: "id", type: "integer", primaryKey: true },
      ...names.map(([name, type]) => ({ name, type, nullable: false })),
    ],
  });
}

describe("generated personal data never resembles a real identifier", () => {
  it("every PII kind gets a value from a test or reserved range and the run validates", () => {
    const model: DataModel = { entities: [piiEntity()], rules: [], flows: [] };
    const scenario: Scenario = { id: "s", name: "s", counts: { people: 100 } };
    const dataset = generateDataset(model, scenario, { seed: 9, now: NOW });
    expect(validateDataset(model, dataset).ok).toBe(true);
    for (const row of dataset.tables.people) {
      expect(row.passport_no).toMatch(/^TX\d{7}$/);
      expect(row.routing_number).toMatch(/^99\d{7}$/);
      expect(row.swift_code).toMatch(/^TEST[A-Z]{2}X0$/);
      expect(row.mac_address).toMatch(/^02:00:00(:[0-9a-f]{2}){3}$/);
      expect(row.imei).toMatch(/^00\d{13}$/);
      expect(row.vin).toMatch(/^1TEST[A-HJ-NPR-Z0-9]{12}$/);
      expect(row.mrn).toMatch(/^MRN-TEST-\d{6}$/);
      expect(row.insurance_member_id).toMatch(/^INS-TEST-\d{8}$/);
      expect(row.drivers_license_number).toMatch(/^DL-TEST-\d{7}$/);
      expect(row.account_number).toMatch(/^000\d{9}$/);
      expect(row.diagnosis_code).toMatch(/^[A-Z]\d\d(\.\d+)?$/);
      expect([
        "Category A",
        "Category B",
        "Category C",
        "Category D",
        "Not disclosed",
      ]).toContain(row.religion);
      expect(row.card_expiry).toMatch(/^(0[1-9]|1[0-2])\/\d\d$/);
      expect(row.cvv).toMatch(/^\d{3}$/);
      expect(row.credit_score).toBeGreaterThanOrEqual(300);
      expect(row.credit_score).toBeLessThanOrEqual(850);
      expect(String(row.linkedin_url)).toMatch(/^https:\/\/social\.example\//);
    }
  });

  it("every sensitive or high-risk column nobody decided on is listed for a decision", () => {
    const report = privacyReport({
      entities: [piiEntity()],
      rules: [],
      flows: [],
    });
    const pending = report.undecided.map((u) => u.field);
    expect(pending).toEqual(
      expect.arrayContaining([
        "passport_no",
        "mrn",
        "insurance_member_id",
        "drivers_license_number",
        "account_number",
        "diagnosis_code",
        "blood_type",
        "religion",
        "card_expiry",
        "cvv",
        "credit_score",
      ]),
    );
    expect(pending).not.toContain("gender");
    expect(pending).not.toContain("user_agent");
  });
});

describe("treatments", () => {
  function run(fields: Field[], rows = 60) {
    const entity = withInferredSemantics({
      id: "t",
      name: "customers",
      evidence: [],
      fields: [{ name: "id", type: "integer", primaryKey: true }, ...fields],
    });
    const model: DataModel = { entities: [entity], rules: [], flows: [] };
    const dataset = generateDataset(
      model,
      { id: "s", name: "s", counts: { t: rows } },
      { seed: 3, now: NOW },
    );
    return { model, dataset, rows: dataset.tables.t };
  }

  it("pseudonymize keeps a unique column unique and shows nothing real", () => {
    const { model, dataset, rows } = run([
      {
        name: "email",
        type: "string",
        unique: true,
        treatment: "pseudonymize",
      },
    ]);
    expect(rows.every((r) => /^PSN-[0-9a-f]{16}$/.test(String(r.email)))).toBe(
      true,
    );
    const report = validateDataset(model, dataset);
    expect(report.checks.find((c) => c.id === "unique:t.email")?.passed).toBe(
      true,
    );
  });

  it("generalize coarsens dates, ages, coordinates and postcodes but keeps their types", () => {
    const { model, dataset, rows } = run([
      { name: "dob", type: "date", treatment: "generalize" },
      {
        name: "age",
        type: "integer",
        min: 18,
        max: 90,
        treatment: "generalize",
      },
      {
        name: "latitude",
        type: "float",
        pii: "quasi",
        treatment: "generalize",
      },
      { name: "zip", type: "string", treatment: "generalize" },
    ]);
    for (const row of rows) {
      expect(row.dob).toMatch(/^\d{4}-01-01$/);
      expect(Number(row.age) % 10 === 0 || row.age === 18).toBe(true);
      expect(String(row.latitude)).toMatch(/^-?\d+(\.\d)?$/);
      expect(String(row.zip)).toMatch(/^\w{3}\**$/);
    }
    expect(validateDataset(model, dataset).ok).toBe(true);
    expect(
      generalizeValue(48213.77, {
        name: "salary",
        type: "decimal",
        semantic: "amount",
      }),
    ).toBe(48000);
  });

  it("a treatment that does not fit the column falls back to synthetic values", () => {
    const { rows } = run([{ name: "dob", type: "date", treatment: "mask" }]);
    expect(rows.every((r) => /^\d{4}-\d\d-\d\d$/.test(String(r.dob)))).toBe(
      true,
    );
    expect(rows.some((r) => String(r.dob).includes("*"))).toBe(false);
  });
});

describe("masking a real export", () => {
  const customers: Entity = withInferredSemantics({
    id: "customers",
    name: "customers",
    evidence: [],
    fields: [
      { name: "email", type: "string", primaryKey: true },
      { name: "first_name", type: "string" },
      { name: "last_name", type: "string" },
      { name: "notes", type: "text", nullable: true },
      { name: "profile", type: "json", nullable: true },
      { name: "plan", type: "string" },
    ],
  });
  const orders: Entity = withInferredSemantics({
    id: "orders",
    name: "orders",
    evidence: [],
    fields: [
      { name: "id", type: "integer", primaryKey: true },
      {
        name: "customer_email",
        type: "string",
        references: { entity: "customers", field: "email" },
      },
      { name: "contact_email", type: "string" },
    ],
  });

  const realCustomers = [
    {
      email: "jane.real@bigbank.com",
      first_name: "Jane",
      last_name: "Real",
      notes: "Prefers calls on +1 212 555 0100; SSN 123-45-6789 on file",
      profile:
        '{"ssn":"123-45-6789","theme":"dark","prefs":{"contact":"jane.real@bigbank.com"}}',
      plan: "gold",
    },
    {
      email: "john.true@bigbank.com",
      first_name: "John",
      last_name: "True",
      notes: "VIP",
      profile: null,
      plan: "basic",
    },
  ];
  const realOrders = [
    {
      id: 1,
      customer_email: "jane.real@bigbank.com",
      contact_email: "jane.real@bigbank.com",
    },
    {
      id: 2,
      customer_email: "john.true@bigbank.com",
      contact_email: "jane.real@bigbank.com",
    },
  ];

  it("a personal primary key and the foreign keys pointing at it get the same token, so the export still joins", () => {
    const c = maskRows(customers, realCustomers, "p", NOW).rows;
    const o = maskRows(orders, realOrders, "p", NOW).rows;
    expect(c[0].email).toMatch(/^PSN-/);
    expect(o[0].customer_email).toBe(c[0].email);
    expect(o[1].customer_email).toBe(c[1].email);
  });

  it("the same real value maps to the same replacement in every column, whatever its name", () => {
    const o = maskRows(orders, realOrders, "p", NOW).rows;
    expect(o[0].contact_email).toBe(o[1].contact_email);
    expect(o[0].contact_email).not.toContain("bigbank");
  });

  it("a row's name and email stay one coherent fake person", () => {
    const c = maskRows(
      {
        ...customers,
        fields: customers.fields.map((f) =>
          f.name === "email" ? { ...f, primaryKey: false } : f,
        ),
      },
      realCustomers,
      "p",
      NOW,
    ).rows;
    const first = String(c[0].first_name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
    expect(String(c[0].email).startsWith(first)).toBe(true);
    expect(c[0].first_name).not.toBe("Jane");
  });

  it("free text and JSON payloads are scrubbed; non-personal columns are kept", () => {
    const { rows, freeTextFound } = maskRows(
      customers,
      realCustomers,
      "p",
      NOW,
    );
    expect(rows[0].notes).toBe("Prefers calls on [phone]; SSN [ssn] on file");
    expect(rows[1].notes).toBe("VIP");
    const profile = JSON.parse(String(rows[0].profile));
    expect(profile.ssn).toMatch(/^9\d\d-00-\d{4}$/);
    expect(profile.prefs.contact).not.toContain("bigbank");
    expect(profile.theme).toBe("dark");
    expect(rows[0].plan).toBe("gold");
    expect(freeTextFound).toBe(4);
  });

  it("an unmodelled column full of personal values is caught by its values", () => {
    const { entity } = entityForColumns(
      customers,
      ["plan", "col7"],
      [
        { plan: "gold", col7: "a@corp.com" },
        { plan: "basic", col7: "b@corp.com" },
      ],
    );
    const { rows } = maskRows(
      entity,
      [{ plan: "gold", col7: "a@corp.com" }],
      "p",
      NOW,
    );
    expect(rows[0].col7).not.toBe("a@corp.com");
    expect(rows[0].plan).toBe("gold");
  });

  it("'keep original' leaves a personal column as it is in an export", () => {
    const kept = {
      ...customers,
      fields: customers.fields.map((f) =>
        f.name === "last_name" ? { ...f, treatment: "keep" as const } : f,
      ),
    };
    expect(maskRows(kept, realCustomers, "p", NOW).rows[0].last_name).toBe(
      "Real",
    );
  });
});

describe("learning a table from sample rows (the custom-schema path)", () => {
  const csv = [
    "id,email,status,amount,signup_date,notes,col7,customer_id,is_active",
    "1,ann@corp.com,active,12.50,2025-01-02,likes tea,x1@corp.com,10,true",
    "2,bob@corp.com,active,99.99,2025-02-03,,x2@corp.com,11,false",
    "3,cy@corp.com,paused,5.00,2025-03-04,call later,x3@corp.com,10,true",
    "4,dee@corp.com,closed,47.10,2025-04-05,,x4@corp.com,12,true",
    "5,eve@corp.com,active,0.99,2025-05-06,vip,x5@corp.com,11,false",
    "6,fay@corp.com,active,15.25,2025-06-07,,x6@corp.com,10,true",
  ].join("\n");

  it("infers types, keys, enums and statistics, and detects personal columns by value", () => {
    const table = parseTabular(csv)!;
    const { entity, detectedByValue } = inferEntityFromSample(
      "orders",
      table.columns,
      table.rows,
      "orders.csv",
    );
    const f = (n: string) => entity.fields.find((x) => x.name === n)!;
    expect(f("id")).toMatchObject({
      type: "integer",
      primaryKey: true,
      unique: true,
    });
    expect(f("email")).toMatchObject({
      type: "string",
      semantic: "email",
      unique: true,
    });
    expect(f("status")).toMatchObject({
      type: "enum",
      enumValues: ["active", "paused", "closed"],
    });
    expect(f("status").distribution).toEqual({
      kind: "categorical",
      weights: { active: 4, paused: 1, closed: 1 },
    });
    expect(f("amount")).toMatchObject({
      type: "decimal",
      scale: 2,
      min: 0.99,
      max: 99.99,
    });
    expect(f("signup_date").type).toBe("date");
    expect(f("notes")).toMatchObject({ nullable: true });
    expect(f("notes").enumValues).toBeUndefined();
    expect(f("col7").semantic).toBe("email");
    expect(detectedByValue).toEqual(["col7"]);
    expect(f("is_active").type).toBe("boolean");
  });

  it("keeps no value from the sample that could identify anyone", () => {
    const table = parseTabular(csv)!;
    const { entity } = inferEntityFromSample(
      "orders",
      table.columns,
      table.rows,
    );
    const stored = JSON.stringify(entity);
    for (const value of [
      "ann@corp.com",
      "x1@corp.com",
      "likes tea",
      "call later",
      "vip",
    ]) {
      expect(stored).not.toContain(value);
    }
  });

  it("is what parseSchemaFile does for CSV and JSON-array files, and links <thing>_id columns", () => {
    const orders = parseSchemaFile("exports/orders.csv", csv).entities[0];
    const customers = parseSchemaFile(
      "exports/customers.json",
      JSON.stringify([
        { id: 10, name: "A" },
        { id: 11, name: "B" },
        { id: 12, name: "C" },
        { id: 13, name: "D" },
        { id: 14, name: "E" },
      ]),
    ).entities[0];
    expect(parseSchemaFile("x.json", '{"type":"object"}').format).toBe(
      "json-schema",
    );
    expect(customers.fields.find((x) => x.name === "id")?.primaryKey).toBe(
      true,
    );
    const linked = linkReferencesByName([orders, customers]);
    const fk = linked
      .find((e) => e.id === "orders")!
      .fields.find((x) => x.name === "customer_id")!;
    expect(fk.references).toEqual({ entity: "customers", field: "id" });
    expect(fk.distribution).toBeUndefined();
    expect(fk.min).toBeUndefined();
    const model: DataModel = {
      entities: [customers, linked[0]],
      rules: [],
      flows: [],
    };
    const dataset = generateDataset(
      model,
      { id: "s", name: "s", counts: { customers: 5, orders: 40 } },
      { seed: 1, now: NOW },
    );
    expect(validateDataset(model, dataset).ok).toBe(true);
  });
});

describe("redaction fits the column", () => {
  it("uses stars instead of a truncated placeholder on short columns", async () => {
    const { redactValue } = await import("#/lib/synth/privacy");
    expect(
      redactValue({ name: "religion", type: "string", maxLength: 8 }),
    ).toBe("***");
    expect(
      redactValue({ name: "religion", type: "string", maxLength: 2 }),
    ).toBe("**");
    expect(redactValue({ name: "religion", type: "string" })).toBe(
      "[REDACTED]",
    );
    expect(
      redactValue({ name: "dob", type: "date", nullable: true }),
    ).toBeNull();
  });
});
