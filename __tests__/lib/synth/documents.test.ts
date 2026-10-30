// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync, zlibSync } from "fflate";
import {
  extractFromDocument,
  readDocument,
  requirementCoverage,
} from "#/lib/synth/documents";
import {
  parseTypeSpec,
  parseValueList,
  toBlocks,
} from "#/lib/synth/documents/extract";
import { formatMaskToPattern, valueFromPattern } from "#/lib/synth/pattern";
import { builtinScenarios } from "#/lib/synth/scenarios";
import { generateDataset } from "#/lib/synth/generate";
import { validateDataset } from "#/lib/synth/validate";
import { modelProblems, type DataModel } from "#/lib/synth/model";
import { createRng } from "#/lib/synth/rng";
import { exportDataset } from "#/lib/synth/exporters";

const BRD = readFileSync(
  `${__dirname}/fixtures/loan-origination-brd.md`,
  "utf8",
);

const FRD = `FUNCTIONAL REQUIREMENTS SPECIFICATION
=====================================

1 Overview
The university portal manages students, courses and enrolments.

2 Student

The following fields are required for a student:
- Student Number (exactly 8 digits, unique)
- Full Name - up to 120 characters
- Gender: Male, Female, Non-binary, Prefer not to say
- Has Scholarship (Yes/No)
- Scholarship Amount
- GPA

3 Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | A student can enroll in many courses. | High |
| FR-2 | A course can have many students. | High |
| FR-3 | The GPA must be between 0 and 4. | Medium |
| FR-4 | Scholarship amount is required when has scholarship is Yes. | Medium |
| FR-5 | Each student has one student profile. | Low |
| FR-6 | A student profile belongs to exactly one student. | Low |
| FR-7 | The course fee cannot be negative. | Low |
| FR-8 | The max seats must be greater than 10 and less than 5. | Low |
| FR-9 | Course code is in the format AAA-9999. | Low |
| FR-10 | No two courses can have the same course code. | Low |
| FR-11 | Course level defaults to Undergraduate. | Low |

4 Data Elements

| Entity | Field Name | Data Type | Required | Example |
| --- | --- | --- | --- | --- |
| Course | Course Code | Text | Yes | ABC-1234 |
| Course | Title | Varchar(200) | Yes | Intro to Databases |
| Course | Fee | Currency | No | 1200.00 |
| Course | Max Seats | Integer | Yes | 40 |
| Course | Level | Dropdown | Yes | Undergraduate / Postgraduate |
| Student Profile | Contact Email | Email | Yes | john.smith@example.com |
| Student Profile | Bio | Long text | No | |
`;

function entity(model: { entities: DataModel["entities"] }, id: string) {
  const e = model.entities.find((x) => x.id === id);
  if (!e) throw new Error(`no entity ${id}`);
  return e;
}

function field(
  model: { entities: DataModel["entities"] },
  id: string,
  name: string,
) {
  const f = entity(model, id).fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${id}.${name}`);
  return f;
}

function generateAndValidate(
  extraction: ReturnType<typeof extractFromDocument>,
) {
  const model: DataModel = {
    entities: extraction.entities,
    rules: extraction.rules,
    flows: [],
  };
  const scenario = builtinScenarios(model).find((s) => s.id === "realistic")!;
  const dataset = generateDataset(model, scenario, {
    seed: 7,
    now: new Date("2026-06-01T00:00:00Z"),
  });
  return { model, dataset, report: validateDataset(model, dataset) };
}

describe("BRD to data model", () => {
  const result = extractFromDocument(BRD, { docName: "brd.md" });

  it("finds the entities a business document describes, with keys and links", () => {
    expect(result.entities.map((e) => e.id).sort()).toEqual(
      ["branch", "customer", "document", "employee", "loan_application"].sort(),
    );
    expect(field(result, "loan_application", "customer_id").references).toEqual(
      {
        entity: "customer",
        field: "id",
      },
    );
    // Branch's key is declared as a Number, so the link follows its type.
    expect(field(result, "branch", "id")).toMatchObject({
      primaryKey: true,
      type: "integer",
    });
    expect(field(result, "loan_application", "branch_id").type).toBe("integer");
    // "managed by a branch manager, who is an employee": a role, not an entity.
    expect(
      field(result, "branch", "branch_manager_id").references?.entity,
    ).toBe("employee");
    expect(field(result, "employee", "manager_id")).toMatchObject({
      nullable: true,
      references: { entity: "employee", field: "id" },
    });
    expect(field(result, "document", "loan_application_id").nullable).toBe(
      false,
    );
  });

  it("turns stated constraints into fields and rules", () => {
    expect(field(result, "loan_application", "requested_amount")).toMatchObject(
      {
        type: "decimal",
        min: 1000,
        max: 250000,
      },
    );
    // "84 months" is not 84 million.
    expect(field(result, "loan_application", "loan_term")).toMatchObject({
      min: 6,
      max: 84,
    });
    expect(field(result, "loan_application", "status").enumValues).toEqual([
      "Draft",
      "Submitted",
      "Under Review",
      "Approved",
      "Rejected",
      "Withdrawn",
    ]);
    expect(
      field(result, "customer", "employment_status").enumValues,
    ).toHaveLength(4);
    expect(field(result, "customer", "email_address").unique).toBe(true);
    expect(
      field(result, "loan_application", "application_number").pattern,
    ).toBe("^LN-(19|20)\\d{2}-\\d{5}$");
    const specs = result.rules.map((r) => r.spec);
    expect(specs).toContainEqual({
      kind: "implies",
      if: { field: "status", in: ["Rejected"] },
      then: { field: "rejection_reason", isNull: false },
    });
    expect(specs).toContainEqual({
      kind: "compare",
      field: "decision_date",
      op: ">=",
      other: "submitted_date",
    });
    // Data dictionary columns: lengths, lists, defaults, mandatory flags.
    expect(field(result, "branch", "branch_code")).toMatchObject({
      maxLength: 6,
      unique: true,
    });
    expect(field(result, "branch", "region").enumValues).toEqual([
      "North",
      "South",
      "East",
      "West",
    ]);
    expect(field(result, "branch", "opened_on")).toMatchObject({
      type: "date",
      nullable: true,
    });
    expect(field(result, "document", "verified")).toMatchObject({
      type: "boolean",
      defaultValue: false,
    });
    expect(field(result, "document", "page_count").max).toBe(50);
  });

  it("traces every element to the requirement it came from", () => {
    const br4 = result.requirements.find((r) => r.id === "BR-004")!;
    expect(br4.mapped).toContain("field:loan_application.requested_amount");
    // Non-data requirements are kept but not counted as data.
    expect(result.requirements.find((r) => r.id === "BR-012")!.kind).toBe(
      "other",
    );
    const coverage = requirementCoverage(result.requirements);
    expect(coverage.uncovered.map((r) => r.id)).toEqual([]);
    expect(coverage.covered).toBe(coverage.data);
  });

  it("removes personal values from the text before anything is kept", () => {
    expect(result.personalValuesRemoved).toBe(2);
    expect(result.text).not.toContain("123-45-6789");
    expect(result.text).not.toContain("jane.doe@gmail.com");
    expect(JSON.stringify(result.requirements)).not.toContain("123-45-6789");
  });

  it("produces a model the engine generates valid data for", () => {
    const { model, dataset, report } = generateAndValidate(result);
    expect(modelProblems(model)).toEqual([]);
    expect(
      report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.label} ${c.samples.join(",")}`),
    ).toEqual([]);
    const loans = dataset.tables.loan_application;
    expect(loans.length).toBeGreaterThan(0);
    for (const row of loans) {
      expect(String(row.application_number)).toMatch(/^LN-(19|20)\d{2}-\d{5}$/);
      if (row.status === "Rejected")
        expect(row.rejection_reason).not.toBeNull();
    }
  });

  it("loads into a database that has no tables yet: schema first, then the seed", () => {
    let hasSqlite = true;
    try {
      execFileSync("sqlite3", ["-version"]);
    } catch {
      hasSqlite = false;
    }
    if (!hasSqlite) return;
    const { model, dataset } = generateAndValidate(result);
    const files = exportDataset(model, dataset, ["sql_sqlite"]);
    const dir = mkdtempSync(join(tmpdir(), "synth-doc-"));
    try {
      const db = join(dir, "verify.db");
      for (const name of ["schema.sqlite.sql", "seed.sqlite.sql"]) {
        const file = files.find((f) => f.path === name)!;
        writeFileSync(join(dir, name), file.content);
        execFileSync("sqlite3", [db, `.read ${join(dir, name)}`]);
      }
      const query = (sql: string) =>
        execFileSync("sqlite3", [db, sql], { stdio: "pipe" }).toString().trim();
      expect(Number(query("select count(*) from loan_application"))).toBe(
        dataset.tables.loan_application.length,
      );
      // The constraints the document stated hold in the database too.
      expect(query("PRAGMA foreign_key_check")).toBe("");
      expect(
        query(
          "select count(*) from loan_application where status = 'Rejected' and rejection_reason is null",
        ),
      ).toBe("0");
      expect(() =>
        query(
          "insert into loan_application (id, requested_amount) values ('x', 5)",
        ),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is deterministic", () => {
    expect(extractFromDocument(BRD, { docName: "brd.md" })).toEqual(result);
  });
});

describe("FRD edge cases", () => {
  const result = extractFromDocument(FRD, { docName: "frd.md" });

  it("builds a join entity for many-to-many and a unique key for one-to-one", () => {
    const join = entity(result, "course_student");
    expect(join.uniqueTogether).toEqual([["course_id", "student_id"]]);
    expect(field(result, "student_profile", "student_id")).toMatchObject({
      unique: true,
      nullable: false,
    });
    // The "has one" side does not also get a key (no cycle).
    expect(entity(result, "student").fields.some((f) => f.references)).toBe(
      false,
    );
  });

  it("reads requirement tables, bullet lists and an entity column", () => {
    expect(field(result, "student", "student_number")).toMatchObject({
      unique: true,
      pattern: "^\\d{8}$",
    });
    expect(field(result, "student", "full_name").maxLength).toBe(120);
    expect(field(result, "student", "gender").enumValues).toContain(
      "Prefer not to say",
    );
    expect(field(result, "student", "gpa")).toMatchObject({
      type: "decimal",
      min: 0,
      max: 4,
    });
    expect(field(result, "course", "course_code")).toMatchObject({
      unique: true,
      pattern: "^[A-Z]{3}-\\d{4}$",
    });
    expect(field(result, "course", "level")).toMatchObject({
      enumValues: ["Undergraduate", "Postgraduate"],
      defaultValue: "Undergraduate",
    });
    expect(field(result, "student_profile", "bio").type).toBe("text");
    expect(result.rules.map((r) => r.spec)).toContainEqual({
      kind: "implies",
      if: { field: "has_scholarship", in: [true] },
      then: { field: "scholarship_amount", isNull: false },
    });
  });

  it("refuses contradictions and leaves them uncovered for the agent", () => {
    expect(result.warnings.some((w) => w.startsWith("FR-8"))).toBe(true);
    expect(field(result, "course", "max_seats").min).toBeUndefined();
    const coverage = requirementCoverage(result.requirements);
    expect(coverage.uncovered.map((r) => r.id)).toEqual(["FR-8"]);
    // Once the agent cites it, it counts as covered.
    expect(
      requirementCoverage(result.requirements, ["frd.md FR-8"]).uncovered,
    ).toEqual([]);
  });

  it("never keeps a personal example value", () => {
    expect(
      field(result, "student_profile", "contact_email").examples,
    ).toBeUndefined();
    expect(field(result, "course", "title").examples).toEqual([
      "Intro to Databases",
    ]);
  });

  it("generates valid data", () => {
    const { model, report } = generateAndValidate(result);
    expect(modelProblems(model)).toEqual([]);
    expect(
      report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.label} ${c.samples.join(",")}`),
    ).toEqual([]);
  });
});

describe("a Word FRD with a business-rule column and numbered requirements", () => {
  const p = (text: string, style?: string, list = false) =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${list ? '<w:numPr><w:ilvl w:val="0"/></w:numPr>' : ""}</w:pPr><w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`;
  const row = (cells: string[]) =>
    `<w:tr>${cells.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`;
  const xml = `<w:document><w:body>
    ${p("2. Policy", "Heading1")}
    <w:tbl>${row(["Field Name", "Data Type", "Mandatory", "Valid Values", "Business Rule"])}
    ${row(["Policy Number", "Text (12)", "Y", "", "Format POL-########, unique"])}
    ${row(["Product", "Dropdown", "Y", "Comprehensive, Third Party, Third Party Fire & Theft", ""])}
    ${row(["Start Date", "Date", "Y", "", ""])}
    ${row(["End Date", "Date", "Y", "", "Must be after the start date"])}
    ${row(["Policyholder SSN", "Text", "N", "", "Example 078-05-1120"])}</w:tbl>
    ${p("3. Claim rules", "Heading1")}
    ${p("FR-01: Each policy can have many claims.", undefined, true)}
    ${p("FR-03: Claim status can be Reported, Assessing, Approved, Rejected or Paid.", undefined, true)}
    ${p("FR-05: If the claim status is Paid, the payment date must be provided.", undefined, true)}
    ${p("FR-06: The incident date cannot be after the reported date.", undefined, true)}
    ${p("FR-08: Fraud scoring runs nightly on all open claims.", undefined, true)}
  </w:body></w:document>`;
  const read = readDocument(
    "Claims-FRD.docx",
    zipSync({ "word/document.xml": strToU8(xml) }),
  );
  const result = extractFromDocument(read.text, { docName: "Claims-FRD.docx" });

  it("reads rules written in a free-text column and keeps multi-word values whole", () => {
    expect(field(result, "policy", "policy_number").pattern).toBe(
      "^POL-\\d{8}$",
    );
    expect(field(result, "policy", "product").enumValues).toEqual([
      "Comprehensive",
      "Third Party",
      "Third Party Fire & Theft",
    ]);
    expect(result.rules.map((r) => r.spec)).toEqual(
      expect.arrayContaining([
        { kind: "compare", field: "end_date", op: ">", other: "start_date" },
        {
          kind: "compare",
          field: "incident_date",
          op: "<=",
          other: "reported_date",
        },
        {
          kind: "implies",
          if: { field: "status", in: ["Paid"] },
          then: { field: "payment_date", isNull: false },
        },
      ]),
    );
    expect(result.text).not.toContain("078-05-1120");
  });

  it("does not read a list of requirements as a list of fields", () => {
    expect(result.entities.map((e) => e.id).sort()).toEqual([
      "claim",
      "policy",
    ]);
    expect(
      entity(result, "claim").fields.some((f) => f.name.startsWith("fr_")),
    ).toBe(false);
    // Nothing in the model says how fraud scoring works: it stays a gap.
    expect(
      requirementCoverage(result.requirements).uncovered.map((r) => r.id),
    ).toEqual(["FR-08"]);
  });

  it("generates valid data", () => {
    const { report } = generateAndValidate(result);
    expect(report.checks.filter((c) => !c.passed).map((c) => c.label)).toEqual(
      [],
    );
  });
});

describe("documents without a data model", () => {
  it("says so for empty and narrative-only text", () => {
    expect(extractFromDocument("").entities).toEqual([]);
    const narrative = extractFromDocument(
      "# Vision\n\nWe want happier staff and faster decisions. The rollout happens in two waves.",
    );
    expect(narrative.entities).toEqual([]);
    expect(narrative.warnings.join(" ")).toMatch(/No data entities/);
    expect(requirementCoverage(narrative.requirements).data).toBe(0);
  });

  it("keeps a tagged requirement whole across its sentences", () => {
    const r = extractFromDocument(
      "US-12: As an adjuster I record each assessment. Each claim can have many assessments. Assessment outcome is one of Approve, Partial or Decline.",
    );
    expect(r.requirements.map((q) => q.id)).toEqual(["US-12"]);
    expect(r.requirements[0].mapped).toEqual(
      expect.arrayContaining([
        "relation:assessment.claim_id",
        "field:assessment.outcome",
      ]),
    );
  });

  it("ignores document sections that are not entities", () => {
    const r = extractFromDocument(
      "## Glossary\n\n- Term: meaning\n\n## Assumptions\n\n- The system is online\n",
    );
    expect(r.entities).toEqual([]);
  });

  it("reads tab-separated data dictionaries pasted from a spreadsheet", () => {
    const r = extractFromDocument(
      "## Vehicle\n\nField\tType\tMandatory\nVIN\tText(17)\tY\nColour\tList\tN\n",
    );
    expect(field(r, "vehicle", "vin")).toMatchObject({
      maxLength: 17,
      nullable: false,
    });
    expect(field(r, "vehicle", "colour").nullable).toBe(true);
  });
});

describe("reading files", () => {
  it("reads HTML headings, lists and tables", () => {
    const html = `<html><head><style>p{}</style></head><body>
      <h2>Supplier</h2><table><tr><th>Field</th><th>Type</th></tr>
      <tr><td>Supplier Name</td><td>Varchar(80)</td></tr>
      <tr><td>Rating</td><td>Integer</td></tr></table>
      <p>Each supplier can have many purchase orders &amp; invoices.</p></body></html>`;
    const read = readDocument("spec.html", strToU8(html));
    expect(read.format).toBe("html");
    expect(read.text).toContain("## Supplier");
    expect(read.text).toContain("| Supplier Name | Varchar(80) |");
    expect(read.text).toContain("purchase orders & invoices");
    const r = extractFromDocument(read.text);
    expect(field(r, "supplier", "name").maxLength).toBe(80);
    expect(field(r, "purchase_order", "supplier_id").references?.entity).toBe(
      "supplier",
    );
  });

  it("reads Word documents: heading styles, lists and tables", () => {
    const p = (text: string, style?: string, list = false) =>
      `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${list ? "<w:numPr/>" : ""}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const cell = (text: string) => `<w:tc>${p(text)}</w:tc>`;
    const xml = `<?xml version="1.0"?><w:document><w:body>
      ${p("Policy", "Heading2")}
      <w:tbl><w:tr>${cell("Field")}${cell("Type")}${cell("Required")}</w:tr>
      <w:tr>${cell("Policy Number")}${cell("Text (12)")}${cell("Yes")}</w:tr>
      <w:tr>${cell("Premium")}${cell("Currency")}${cell("Yes")}</w:tr></w:tbl>
      ${p("Each policy holder can have many policies.")}
      ${p("Premium must be greater than 0.", undefined, true)}
    </w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(xml) });
    const read = readDocument("policy.docx", docx);
    expect(read.warnings).toEqual([]);
    expect(read.text).toContain("## Policy");
    expect(read.text).toContain("- Premium must be greater than 0.");
    const r = extractFromDocument(read.text);
    expect(field(r, "policy", "policy_number").maxLength).toBe(12);
    expect(field(r, "policy", "premium")).toMatchObject({
      type: "decimal",
      min: 0.01,
    });
    expect(field(r, "policy", "policy_holder_id").references?.entity).toBe(
      "policy_holder",
    );
  });

  it("reads Excel data dictionaries, one table per sheet", () => {
    const shared = [
      "Field",
      "Data Type",
      "Allowed Values",
      "Ticket Status",
      "Picklist",
      "Open, In Progress, Closed",
    ];
    const sst = `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`;
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>Opened At</t></is></c><c r="B3" t="inlineStr"><is><t>Timestamp</t></is></c></row>
    </sheetData></worksheet>`;
    const xlsx = zipSync({
      "xl/workbook.xml": strToU8(
        `<workbook><sheets><sheet name="Ticket" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/sharedStrings.xml": strToU8(sst),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    });
    const read = readDocument("dictionary.xlsx", xlsx);
    expect(read.text).toContain("## Ticket");
    const r = extractFromDocument(read.text);
    expect(field(r, "ticket", "status").enumValues).toEqual([
      "Open",
      "In Progress",
      "Closed",
    ]);
    expect(field(r, "ticket", "opened_at").type).toBe("datetime");
  });

  it("reads the text layer of a PDF, compressed or not", () => {
    const content =
      "BT /F1 12 Tf 72 720 Td (Each warehouse can have many bins.) Tj 0 -14 Td (A bin belongs to one warehouse.) Tj ET";
    const compressed = zlibSync(strToU8(content));
    const parts: (string | Uint8Array)[] = [
      "%PDF-1.4\n1 0 obj\n<< /Length 10 /Filter /FlateDecode >>\nstream\n",
      compressed,
      "\nendstream\nendobj\n%%EOF",
    ];
    const bytes = new Uint8Array(
      parts.reduce(
        (n, p) => n + (typeof p === "string" ? p.length : p.length),
        0,
      ),
    );
    let offset = 0;
    for (const part of parts) {
      const chunk = typeof part === "string" ? strToU8(part) : part;
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const read = readDocument("spec.pdf", bytes);
    expect(read.text).toContain("Each warehouse can have many bins.");
    const r = extractFromDocument(read.text);
    expect(field(r, "bin", "warehouse_id").references?.entity).toBe(
      "warehouse",
    );
  });

  it("hands unreadable PDFs and broken files to the agent with a reason", () => {
    const scanned = readDocument("scan.pdf", strToU8("%PDF-1.4\n%%EOF"));
    expect(scanned.unreadable).toBe(true);
    expect(scanned.warnings.join(" ")).toMatch(/agent will extract it/);
    const broken = readDocument("broken.docx", strToU8("not a zip"));
    expect(broken.unreadable).toBe(true);
    expect(broken.warnings.join(" ")).toMatch(/could not be read/);
  });

  it("decodes UTF-16 text and strips a byte order mark", () => {
    const text = "Each author can have many books written in many languages.";
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16[0] = 0xff;
    utf16[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff;
      utf16[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    const read = readDocument("notes.txt", utf16);
    expect(read.text).toBe(text);
    const withBom = readDocument("notes.md", strToU8(`\uFEFF${text}`));
    expect(withBom.text).toBe(text);
  });
});

describe("small parsers", () => {
  it("reads type words analysts use", () => {
    expect(parseTypeSpec("VARCHAR(50)")).toEqual({
      type: "string",
      maxLength: 50,
    });
    expect(parseTypeSpec("Number(10,2)")).toEqual({
      type: "decimal",
      scale: 2,
    });
    expect(parseTypeSpec("Date (DD/MM/YYYY)")).toEqual({ type: "date" });
    expect(parseTypeSpec("Y/N")).toEqual({ type: "boolean" });
    expect(parseTypeSpec("Percentage")).toMatchObject({
      type: "decimal",
      max: 100,
    });
    expect(parseTypeSpec("Long text")).toEqual({ type: "text" });
    expect(parseTypeSpec("whatever")).toBeNull();
  });

  it("reads value lists in their many spellings", () => {
    expect(parseValueList("Active, Inactive or Closed")).toEqual([
      "Active",
      "Inactive",
      "Closed",
    ]);
    expect(parseValueList("A = Active; I = Inactive")).toEqual(["A", "I"]);
    expect(parseValueList("Draft/Submitted/Approved")).toEqual([
      "Draft",
      "Submitted",
      "Approved",
    ]);
    expect(parseValueList("only one")).toBeNull();
  });

  it("generates values matching format masks", () => {
    const rng = createRng(1);
    for (const [mask, sample] of [
      ["LN-YYYY-#####", /^LN-(19|20)\d{2}-\d{5}$/],
      ["AAA-9999", /^[A-Z]{3}-\d{4}$/],
      ["INV/XXXX", /^INV\/[A-Z0-9]{4}$/],
    ] as const) {
      const pattern = formatMaskToPattern(mask)!;
      expect(new RegExp(pattern).source).toBe(new RegExp(pattern).source);
      for (let i = 0; i < 20; i += 1) {
        expect(valueFromPattern(pattern, rng)).toMatch(sample);
      }
    }
    expect(formatMaskToPattern("XXX-XX-XXXX", { numericX: true })).toBe(
      "^\\d{3}-\\d{2}-\\d{4}$",
    );
    expect(valueFromPattern("(?=x)a", rng)).toBeNull();
  });

  it("splits headings, numbered sections, lists and tables", () => {
    const blocks = toBlocks(
      "3.2 Customer Details\n\n- Name\n- Email\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "table"]);
    expect(blocks[0].text).toBe("Customer Details");
    expect(blocks[2].rows).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });
});
