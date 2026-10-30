import {
  slugId,
  type Entity,
  type Field,
  type FieldType,
  type PiiClass,
  type Rule,
  type RuleSpec,
} from "../model";
import { inferSemantic, piiClassOf } from "../semantics";
import { detectValue, scrubFreeText } from "../pii-detect";
import { formatMaskToPattern } from "../pattern";

/* eslint-disable no-param-reassign -- the extractor builds one model in place: drafts, fields and requirements are mutated as sentences add to them. */
/**
 * Requirements document → data model. Reads what business documents
 * actually say about data:
 *
 * - data dictionary tables ("Field | Type | Required | Description"), in
 *   any of the header spellings analysts use, owned by the table's
 *   "Entity" column or by the section it sits in;
 * - attribute sentences and lists ("A customer has a name, email and date
 *   of birth", "The system shall capture the following for each loan:");
 * - relationships ("Each customer can have many accounts", "A loan
 *   belongs to exactly one branch", many-to-many, "reports to another
 *   employee");
 * - constraints: allowed values, ranges, lengths, uniqueness, mandatory /
 *   optional, formats ("LN-YYYY-#####"), defaults, "end date after start
 *   date", "if status is Rejected a reason is required".
 *
 * Every element remembers the requirement it came from (the document's own
 * id such as BR-012, or a generated DOC-n) so coverage can be shown and the
 * agent can cite it. Personal values found in the text (an example SSN, a
 * real email) are removed before anything is kept, and never become
 * examples. Deterministic: same text, same model.
 */

export interface DocRequirement {
  /** The document's own id (BR-012, FR-3.2) or a generated DOC-n. */
  id: string;
  docId: string;
  /** Scrubbed, at most 320 characters. */
  text: string;
  section?: string;
  /** Whether it talks about data (entities, fields, rules). */
  kind: "data" | "other";
  /** What it became: "entity:loan", "field:loan.amount", "rule:<id>". */
  mapped: string[];
}

export interface DocumentExtraction {
  entities: Entity[];
  rules: Rule[];
  requirements: DocRequirement[];
  warnings: string[];
  /** Personal values (emails, SSNs, cards ...) removed from the text. */
  personalValuesRemoved: number;
  /** The normalised, scrubbed text (what the agent reads). */
  text: string;
}

/* ── Text helpers ──────────────────────────────────────────────────────── */

interface Block {
  kind: "heading" | "para" | "list" | "table";
  text: string;
  level: number;
  items: string[];
  rows: string[][];
  section: string;
}

const LIST_ITEM =
  /^\s*(?:[-*•▪◦‣●○■□➢➤✓✔]|\d{1,3}[.)]|[a-z][.)]|\((?:\d{1,3}|[a-z]|[ivx]+)\))\s+(.+)$/;
const NUMBERED_HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,4})\.?\s+(\S.{0,80})$/;
const MODAL_WORD =
  /\b(shall|must|should|will|can|may|could|is|are|has|have|include|includes|contains?)\b/i;

function stripNumbering(text: string): string {
  return text
    .replace(/^\s*(?:section|chapter|appendix)\s+[\dA-Z.]+[:.)-]?\s*/i, "")
    .replace(/^\s*\d{1,2}(?:\.\d{1,2}){0,4}\.?\s+/, "")
    .replace(/[:\s]+$/, "")
    .trim();
}

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let section = "";
  let para: string[] = [];
  const empty = (): Block => ({
    kind: "para",
    text: "",
    level: 0,
    items: [],
    rows: [],
    section,
  });
  const flushPara = () => {
    if (para.length) {
      blocks.push({ ...empty(), kind: "para", text: para.join(" ") });
      para = [];
    }
  };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      flushPara();
      continue;
    }
    const md = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    const numbered = NUMBERED_HEADING.exec(line);
    const setext =
      /^(=+|-+)$/.test(lines[i + 1]?.trim() ?? "") && line.length < 90;
    if (
      md ||
      setext ||
      (numbered &&
        !/[.!?;,]$/.test(line) &&
        numbered[2].split(/\s+/).length <= 8 &&
        !MODAL_WORD.test(numbered[2]) &&
        /^[A-Z]/.test(numbered[2]))
    ) {
      flushPara();
      const title = stripNumbering(md ? md[2] : line);
      const level = md
        ? md[1].length
        : setext
          ? lines[i + 1].trim()[0] === "="
            ? 1
            : 2
          : (numbered?.[1].split(".").length ?? 1);
      if (setext) i += 1;
      section = title;
      blocks.push({ ...empty(), kind: "heading", text: title, level, section });
      continue;
    }
    if (line.startsWith("|") && line.indexOf("|", 1) > 0) {
      flushPara();
      const rows: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        const cells = splitRow(lines[j]);
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) {
          rows.push(cells);
        }
        j += 1;
      }
      i = j - 1;
      if (rows.length) blocks.push({ ...empty(), kind: "table", rows });
      continue;
    }
    // Tab-separated rows (pasted spreadsheets, PDF tables) become tables.
    if (
      (raw.match(/\t/g)?.length ?? 0) >= 1 &&
      (lines[i + 1]?.match(/\t/g)?.length ?? 0) >= 1
    ) {
      flushPara();
      const rows: string[][] = [];
      let j = i;
      while (j < lines.length && (lines[j].match(/\t/g)?.length ?? 0) >= 1) {
        rows.push(lines[j].split("\t").map((c) => c.trim()));
        j += 1;
      }
      i = j - 1;
      blocks.push({ ...empty(), kind: "table", rows });
      continue;
    }
    const item = LIST_ITEM.exec(raw);
    if (item) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list" && last.section === section) {
        last.items.push(item[1].trim());
      } else {
        blocks.push({ ...empty(), kind: "list", items: [item[1].trim()] });
      }
      continue;
    }
    // An indented line right after a list item continues it.
    const last = blocks[blocks.length - 1];
    if (!para.length && last?.kind === "list" && /^\s{2,}/.test(raw)) {
      last.items[last.items.length - 1] += ` ${line}`;
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

const ABBREVIATIONS =
  /\b(e\.g|i\.e|etc|vs|approx|incl|no|nos|min|max|dept|mr|mrs|ms|dr|st|inc|ltd)\./gi;

/** Stands in for the dot of "e.g." while sentences are split. */
const DOT_PLACEHOLDER = "\u2024";

export function splitSentences(text: string): string[] {
  const protectedText = text.replace(ABBREVIATIONS, (m) =>
    m.replace(/\./g, DOT_PLACEHOLDER),
  );
  return protectedText
    .split(/(?<=[.!?;])\s+(?=["'“([]?[A-Z0-9])/)
    .map((s) => s.split(DOT_PLACEHOLDER).join(".").trim())
    .filter((s) => s.length > 2)
    .map((s) => s.slice(0, 600));
}

/* ── Words: entities and fields ────────────────────────────────────────── */

const DETERMINER =
  /^(?:the|a|an|each|every|any|all|one|its|their|his|her|our|your|this|that|these|those|such|new|existing|valid)\s+/i;

const NOT_ENTITIES = new Set(
  [
    "system",
    "platform",
    "solution",
    "software",
    "portal",
    "app",
    "module",
    "screen",
    "page",
    "field",
    "attribute",
    "column",
    "record",
    "row",
    "data",
    "information",
    "detail",
    "details",
    "user interface",
    "ui",
    "process",
    "step",
    "workflow",
    "requirement",
    "section",
    "option",
    "ability",
    "access",
    "time",
    "way",
    "value",
    "list",
    "set",
    "form",
    "button",
    "message",
    "error",
    "number",
    "type",
    "rule",
    "report",
    "dashboard",
    "api",
    "database",
    "table",
    "entity",
    "object",
    "item",
    "thing",
    "it",
    "they",
    "them",
    "this",
    "that",
    "following",
    "who",
    "which",
  ].map((w) => w.toLowerCase()),
);

/** Headings that name document parts, never an entity. */
const DOC_SECTION =
  /^(introduction|overview|purpose|scope|background|glossary|definitions?|acronyms|abbreviations|assumptions|constraints|dependencies|risks|appendix|appendices|revision history|version history|document control|references|summary|executive summary|objectives?|goals?|stakeholders?|approvals?|sign[- ]?off|table of contents|contents|out of scope|in scope|functional requirements|non[- ]functional requirements|business requirements|system requirements|data requirements|requirements|data model|data dictionary|data elements|entities|user interface|ui requirements|screens?|reports?|reporting|integrations?|interfaces|security|performance|availability|audit|notifications?|use cases?|user stories|acceptance criteria|business rules|validation rules|workflow|process flow|current state|future state|open issues|issues|notes|faq|contact|document purpose|intended audience|related documents|high[- ]level requirements|detailed requirements|data|business process|process|features?|feature list)$/i;

const ENTITY_SUFFIX =
  /\s+(?:entity|table|object|record|records|data|details|information|attributes|fields|master|master data|data dictionary|data elements|data model|schema|rules?|requirements?|management)$/i;
const ENTITY_PREFIX =
  /^(?:entity|table|object|data dictionary|data elements|data requirements|attributes|fields)\s*(?:for|of|[:\-–])\s*/i;

function singularWord(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (/(ss|us|is|ics|ous)$/.test(w)) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (
    /(ses)$/.test(w) &&
    /(statuses|addresses|businesses|classes|courses|expenses|licenses|responses|cases|purchases|releases|phases|databases|houses|leases|nurses|warehouses)$/.test(
      w,
    )
  ) {
    return w.slice(0, -1);
  }
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

function titleCase(words: string): string {
  return words
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w === w.toUpperCase() && w.length <= 5
        ? w
        : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** "the customers'" → "customer"; null when the phrase is not an entity. */
export function entityPhrase(raw: string): string | null {
  let s = raw
    .replace(/[“”"'`]/g, "")
    .replace(/[’']s\b/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(ENTITY_PREFIX, "")
    .trim();
  for (let k = 0; k < 3; k += 1) s = s.replace(DETERMINER, "");
  s = s
    .replace(ENTITY_SUFFIX, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  const words = s.split(" ");
  if (words.length > 3 || s.length > 40) return null;
  if (words.some((w) => /^\d+$/.test(w))) return null;
  if (
    MODAL_WORD.test(s) ||
    /\b(and|or|of|to|for|with|by|from|in|on|at)\b/i.test(s)
  )
    return null;
  if (DOC_SECTION.test(s.toLowerCase())) return null;
  words[words.length - 1] = singularWord(words[words.length - 1]);
  const phrase = words.join(" ").toLowerCase();
  if (NOT_ENTITIES.has(phrase) || DOC_SECTION.test(phrase)) return null;
  return phrase;
}

const FIELD_STOP =
  /\b(shall|must|should|will|can|may|could|would|is|are|was|were|be|been|allow|allows|enable|ensure|provide|display|show|send|click|select|enter|following|these|those)\b/i;

/** "Customer's Date of Birth (mandatory)" → "date_of_birth" (owner stripped). */
export function fieldName(raw: string, owner?: string): string | null {
  let s = raw
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[“”"`]/g, "")
    .replace(/\s+[-–—:]\s+.*$/, "")
    .replace(/:.*$/, "")
    .replace(/^(?:and|or|plus|also)\s+/i, "")
    .trim();
  for (let k = 0; k < 3; k += 1) s = s.replace(DETERMINER, "");
  s = s.replace(/[’']s\b/g, "").trim();
  if (!s || s.length > 60 || FIELD_STOP.test(s)) return null;
  const words = s.split(/\s+/);
  if (words.length > 6) return null;
  if (!/[\p{L}]/u.test(s)) return null;
  let slug = slugId(s);
  if (!slug) return null;
  if (owner) {
    const o = slugId(owner);
    if (slug !== o && slug.startsWith(`${o}_`)) {
      const rest = slug.slice(o.length + 1);
      // "Customer ID" under Customer is its key, "Customer Name" its name;
      // "Student Number" stays student_number (a bare "number" says nothing).
      if (!/^(number|no|code|reference|ref|num)$/.test(rest)) slug = rest;
    }
  }
  if (/^\d/.test(slug)) slug = `f_${slug}`;
  return slug.slice(0, 48);
}

/* ── Types, numbers, value lists ───────────────────────────────────────── */

export interface TypeSpec {
  type: FieldType;
  maxLength?: number;
  scale?: number;
  min?: number;
  max?: number;
  semantic?: Field["semantic"];
}

/** "VARCHAR(50)", "Text (100)", "Number(10,2)", "Date (DD/MM/YYYY)", "Y/N". */
export function parseTypeSpec(raw: string): TypeSpec | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  const size = /\(?\s*(\d{1,6})\s*(?:,\s*(\d{1,2}))?\s*\)?/.exec(
    s.replace(/^[a-z /-]+/, ""),
  );
  const n = size ? Number(size[1]) : undefined;
  const scale = size?.[2] !== undefined ? Number(size[2]) : undefined;
  if (/\b(uuid|guid)\b/.test(s)) return { type: "uuid" };
  if (/\b(date ?time|timestamp|datetime|date and time|date & time)\b/.test(s))
    return { type: "datetime" };
  if (/^time\b/.test(s)) return { type: "time" };
  if (/\bdate\b/.test(s)) return { type: "date" };
  if (
    /\b(bool|boolean|bit|flag|indicator|yes ?\/ ?no|y ?\/ ?n|true ?\/ ?false|checkbox|tick ?box|toggle)\b/.test(
      s,
    )
  )
    return { type: "boolean" };
  if (/\b(currency|money|amount)\b/.test(s))
    return { type: "decimal", scale: scale ?? 2 };
  if (/\b(percent|percentage)\b|%/.test(s))
    return { type: "decimal", scale: scale ?? 2, min: 0, max: 100 };
  if (
    /\b(long text|memo|clob|paragraph|rich text|multi[- ]?line|textarea|notes)\b/.test(
      s,
    )
  )
    return { type: "text" };
  if (/\b(decimal|numeric|number|num|float|double|real)\b/.test(s)) {
    if (/\b(float|double|real)\b/.test(s)) return { type: "float" };
    if (scale !== undefined && scale > 0) return { type: "decimal", scale };
    if (/\bdecimal\b/.test(s)) return { type: "decimal", scale: 2 };
    return { type: "integer" };
  }
  if (
    /\b(int|integer|bigint|smallint|tinyint|whole number|count|long)\b/.test(s)
  )
    return { type: "integer" };
  if (/\b(email|e-mail)\b/.test(s))
    return { type: "string", semantic: "email", maxLength: n };
  if (/\b(phone|telephone|mobile)\b/.test(s))
    return { type: "string", semantic: "phone", maxLength: n };
  if (/\b(url|uri|link|hyperlink)\b/.test(s))
    return { type: "string", semantic: "url", maxLength: n };
  if (/\b(json|object|array)\b/.test(s)) return { type: "json" };
  if (
    /\b(enum|list|dropdown|drop-down|drop down|picklist|pick list|lookup|select|radio|choice|lov|code list)\b/.test(
      s,
    )
  )
    return { type: "enum" };
  if (
    /\b(long text|memo|clob|paragraph|rich text|multi[- ]?line|textarea|notes)\b/.test(
      s,
    )
  )
    return { type: "text" };
  if (/\b(blob|binary|file|image|attachment|document|upload)\b/.test(s))
    return { type: "string", maxLength: 255 };
  if (
    /\b(varchar|nvarchar|char|nchar|string|text|alpha ?numeric|alphanumeric|alpha|an|character|characters|chars|free text)\b/.test(
      s,
    )
  ) {
    return {
      type: "string",
      maxLength: n ?? (/^text$/.test(s) ? 255 : undefined),
    };
  }
  return null;
}

const NUM = String.raw`([$€£₹¥]?\s?-?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|mn|bn|million|thousand|billion|lakh|crore)\b|\s?%)?)`;

export function parseNumber(raw: string): number | null {
  const s = raw
    .toLowerCase()
    .replace(/[$€£₹¥\s]/g, "")
    .replace(/,/g, "");
  const m =
    /^(-?\d+(?:\.\d+)?)(k|m|mn|bn|million|thousand|billion|lakh|crore|%)?$/.exec(
      s,
    );
  if (!m) return null;
  let n = Number(m[1]);
  const unit = m[2];
  if (unit === "k" || unit === "thousand") n *= 1_000;
  else if (unit === "m" || unit === "mn" || unit === "million") n *= 1_000_000;
  else if (unit === "bn" || unit === "billion") n *= 1_000_000_000;
  else if (unit === "lakh") n *= 100_000;
  else if (unit === "crore") n *= 10_000_000;
  return Number.isFinite(n) ? n : null;
}

/** "Active, Inactive or Closed", "A = Active; I = Inactive", "Draft/Submitted". */
export function parseValueList(raw: string): string[] | null {
  let s = raw
    .replace(
      /\b(?:e\.g\.|i\.e\.|etc\.?|and so on|such as|among others|the following|following values|values?|options?)\b:?/gi,
      " ",
    )
    .replace(/^[\s:–-]+|[\s.:]+$/g, "")
    .trim();
  if (!s) return null;
  // "Fire & Theft" is one value; "A, B or C" is three.
  s = s.replace(/\s+(?:and\/or|or|and)\s+/gi, ", ");
  const parts = s
    .split(/\s*(?:[,;|\n]|\s\/\s|(?<=\w)\/(?=\w))\s*/)
    .map((p) =>
      p
        .replace(/^[-•*\s]+/, "")
        .replace(/^(?:either|one of|any of)\s+/i, "")
        .replace(/[“”"'`]/g, "")
        .replace(/[.)]+$/, "")
        .trim(),
    )
    .filter(Boolean);
  // "A = Active" pairs keep the stored code.
  const values = parts.map((p) => {
    const pair = /^([A-Z0-9_]{1,6})\s*(?:=|:|-|–)\s*\S.*$/.exec(p);
    return pair ? pair[1] : p;
  });
  const unique = [...new Set(values)];
  if (unique.length < 2 || unique.length > 60) return null;
  if (unique.some((v) => v.length > 48 || v.split(/\s+/).length > 5))
    return null;
  if (unique.some((v) => FIELD_STOP.test(v) && v.split(/\s+/).length > 2))
    return null;
  return unique;
}

/* ── Header synonyms for data dictionaries ─────────────────────────────── */

type ColumnRole =
  | "field"
  | "entity"
  | "type"
  | "length"
  | "required"
  | "nullable"
  | "unique"
  | "key"
  | "values"
  | "min"
  | "max"
  | "range"
  | "default"
  | "description"
  | "example"
  | "pii"
  | "format"
  | "id"
  | "requirement";

const ROLE_HEADERS: [ColumnRole, RegExp][] = [
  [
    "entity",
    /^(entity|table|table name|entity name|object|object name|record|record type|screen|form|section)$/,
  ],
  [
    "field",
    /^(field|field name|fieldname|attribute|attribute name|column|column name|data element|data element name|element|element name|data item|data field|property|property name|field\/attribute|name|label|field label|business name|logical name|physical name)$/,
  ],
  [
    "type",
    /^(type|data type|datatype|field type|data format|kind|attribute type|column type)$/,
  ],
  ["format", /^(format|input format|display format|mask|pattern)$/],
  [
    "length",
    /^(length|size|max length|maximum length|max size|field length|width|max chars|max\.? length|len)$/,
  ],
  [
    "required",
    /^(required|mandatory|req\.?|m\/o|mandatory\/optional|mandatory \/ optional|required\?|mandatory\?|is required|is mandatory|obligation|optionality|optional\/mandatory|o\/m)$/,
  ],
  [
    "nullable",
    /^(nullable|null|allow null|allow nulls|null\?|optional|optional\?|is optional)$/,
  ],
  ["unique", /^(unique|uniq|is unique|unique\?)$/],
  [
    "key",
    /^(key|keys|pk|pk\/fk|key type|constraint|constraints|primary key|pk\?|fk)$/,
  ],
  [
    "values",
    /^(values|allowed values|valid values|possible values|permitted values|domain|domain values|options|list of values|lov|enum|enum values|picklist|pick list|codes|code values|lookup values|accepted values)$/,
  ],
  ["min", /^(min|minimum|min value|minimum value|lower limit)$/],
  ["max", /^(max|maximum|max value|maximum value|upper limit)$/],
  ["range", /^(range|valid range|value range|allowed range|limits)$/],
  ["default", /^(default|default value|defaults)$/],
  [
    "description",
    /^(description|desc|definition|business definition|notes|note|comments|comment|remarks|business rule|business rules|rules|validation|validations|validation rule|validation rules|meaning|purpose|details|explanation)$/,
  ],
  [
    "example",
    /^(example|examples|sample|sample value|sample values|example value|e\.g\.)$/,
  ],
  [
    "pii",
    /^(pii|pii\?|sensitive|sensitivity|classification|data classification|confidentiality|privacy|gdpr|personal data|security classification)$/,
  ],
  [
    "id",
    /^(id|req id|req\. id|requirement id|req #|req no|#|no\.?|ref|ref\.?|reference|br id|fr id|rule id|story id)$/,
  ],
  [
    "requirement",
    /^(requirement|requirements|requirement description|business requirement|functional requirement|statement|user story|story|acceptance criteria|rule|business rule description|description of requirement)$/,
  ],
];

function roleOf(header: string): ColumnRole | null {
  const h = header
    .toLowerCase()
    .replace(/[*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [role, re] of ROLE_HEADERS) if (re.test(h)) return role;
  return null;
}

function yes(value: string): boolean | null {
  const v = value.toLowerCase().replace(/[.*]/g, "").trim();
  if (!v || v === "-" || v === "n/a" || v === "na") return null;
  if (/^(y|yes|true|1|x|m|mandatory|required|req|✓|✔|☑|always)$/.test(v))
    return true;
  if (/^(n|no|false|0|o|opt|optional|not required|conditional|c)$/.test(v))
    return false;
  if (/^(yes|mandatory|required)\b/.test(v)) return true;
  if (/^(no|optional)\b/.test(v)) return false;
  return null;
}

/* ── The model under construction ──────────────────────────────────────── */

interface Draft {
  id: string;
  name: string;
  fields: Map<string, Field>;
  /** Where a field's type came from: a table beats prose. */
  typeFrom: Map<string, "table" | "prose" | "name">;
  /** Fields a document said are mandatory / optional explicitly. */
  explicitNull: Map<string, boolean>;
  evidence: Set<string>;
  description?: string;
  /** Mentioned only in passing (relation target with no attributes). */
  stub: boolean;
  uniqueTogether: string[][];
}

interface Relation {
  child: string;
  parent: string;
  /** "has one" phrasing: weaker than "has many"/"belongs to". */
  weak: boolean;
  optional: boolean;
  many: boolean;
  field?: string;
  req: DocRequirement;
}

class Builder {
  entities = new Map<string, Draft>();
  rules: Rule[] = [];
  relations: Relation[] = [];
  warnings: string[] = [];
  aliases = new Map<string, string>();

  constructor(readonly docName: string) {}

  ensure(phrase: string, req: DocRequirement | null, stub = false): Draft {
    const id = slugId(phrase);
    const existing = this.entities.get(this.aliases.get(id) ?? id);
    if (existing) {
      if (!stub) existing.stub = false;
      if (req) this.cite(existing, req, `entity:${existing.id}`);
      return existing;
    }
    const draft: Draft = {
      id,
      name: titleCase(phrase),
      fields: new Map(),
      typeFrom: new Map(),
      explicitNull: new Map(),
      evidence: new Set(),
      stub,
      uniqueTogether: [],
    };
    this.entities.set(id, draft);
    if (req) this.cite(draft, req, `entity:${id}`);
    return draft;
  }

  find(phrase: string | null): Draft | undefined {
    if (!phrase) return undefined;
    const id = slugId(phrase);
    const exact = this.entities.get(this.aliases.get(id) ?? id);
    if (exact) return exact;
    // "the application" for "Loan Application" when nothing else ends so.
    const bySuffix = [...this.entities.values()].filter((d) =>
      d.id.endsWith(`_${id}`),
    );
    return bySuffix.length === 1 ? bySuffix[0] : undefined;
  }

  cite(draft: Draft, req: DocRequirement, mapped: string) {
    draft.evidence.add(
      `${this.docName} ${req.id}${req.section ? ` (${req.section})` : ""}`,
    );
    if (!req.mapped.includes(mapped)) req.mapped.push(mapped);
    req.kind = "data";
  }

  field(
    draft: Draft,
    name: string,
    req: DocRequirement | null,
    spec: TypeSpec | null,
    from: "table" | "prose" | "name",
  ): Field {
    let field = draft.fields.get(name);
    const typeFromName =
      from === "name" || !spec ? typeFromFieldName(name) : null;
    const resolved = spec ?? typeFromName ?? { type: "string" as FieldType };
    if (!field) {
      field = { name, type: resolved.type };
      draft.fields.set(name, field);
      draft.typeFrom.set(name, spec ? from : "name");
      applyTypeSpec(field, resolved);
    } else if (spec) {
      const rank = { name: 0, prose: 1, table: 2 } as const;
      const prev = draft.typeFrom.get(name) ?? "name";
      if (rank[from] >= rank[prev] && field.type !== "enum") {
        field.type = spec.type;
        applyTypeSpec(field, spec);
        draft.typeFrom.set(name, from);
      } else if (rank[from] >= rank[prev]) {
        applyTypeSpec(field, { ...spec, type: field.type });
      }
    }
    if (req) this.cite(draft, req, `field:${draft.id}.${name}`);
    return field;
  }

  rule(
    entity: Draft,
    spec: RuleSpec,
    description: string,
    req: DocRequirement,
  ) {
    const key = JSON.stringify(spec);
    const exists = this.rules.find(
      (r) => r.entity === entity.id && JSON.stringify(r.spec) === key,
    );
    const id = exists?.id ?? `doc_${entity.id}_${this.rules.length + 1}`;
    if (!exists) {
      this.rules.push({
        id,
        entity: entity.id,
        description: description.slice(0, 200),
        spec,
        evidence: [`${this.docName} ${req.id}`],
      });
    }
    this.cite(entity, req, `rule:${id}`);
  }
}

function applyTypeSpec(field: Field, spec: TypeSpec) {
  if (spec.maxLength !== undefined && spec.maxLength > 0)
    field.maxLength = spec.maxLength;
  if (spec.scale !== undefined) field.scale = spec.scale;
  if (spec.min !== undefined && field.min === undefined) field.min = spec.min;
  if (spec.max !== undefined && field.max === undefined) field.max = spec.max;
  if (spec.semantic) field.semantic = spec.semantic;
}

/** A sensible type for a field the document names but does not type. */
export function typeFromFieldName(name: string): TypeSpec {
  const n = name.toLowerCase();
  if (/(^|_)(id|uuid|guid)$/.test(n) && n !== "id")
    return { type: "string", maxLength: 64 };
  if (/(^|_)(email|e_mail|email_address)$/.test(n))
    return { type: "string", semantic: "email", maxLength: 255 };
  if (/(^|_)(phone|mobile|telephone|cell|fax)(_number|_no)?$/.test(n))
    return { type: "string", semantic: "phone", maxLength: 32 };
  if (/(_at|_timestamp|_datetime|_time)$|^(timestamp|datetime)$/.test(n))
    return { type: "datetime" };
  if (
    /(^|_)(date|dob|birthday|deadline|due|expiry|expiration|anniversary)($|_)|(_on|_date)$|date_of_/.test(
      n,
    )
  )
    return { type: "date" };
  if (
    /^(is|has|can|should|allow|allows|enable|enabled|requires|was)_|(_flag|_indicator|_ind|_yn)$|^(active|enabled|verified|approved|consent|opt_in|deleted|archived|locked|primary|default)$/.test(
      n,
    )
  )
    return { type: "boolean" };
  if (
    /(percent|percentage|_pct|ratio|_rate)$|^(rate|interest_rate|apr|discount_rate|tax_rate)$/.test(
      n,
    )
  )
    return { type: "decimal", scale: 2, min: 0, max: 100 };
  if (
    /(^|_)(gpa|cgpa|weight|height|width|depth|temperature|distance|ratio)($|_)/.test(
      n,
    )
  )
    return { type: "decimal", scale: 2, min: 0 };
  if (
    /(amount|price|cost|fee|fees|balance|salary|income|total|subtotal|premium|limit|payment|charge|budget|revenue|tax|discount|value|valuation|deposit|principal|emi|installment|instalment|wage|bonus|refund|credit|debit|spend|outstanding)($|_)/.test(
      n,
    )
  )
    return { type: "decimal", scale: 2, min: 0 };
  if (
    /(^|_)(count|quantity|qty|age|years|months|days|weeks|hours|minutes|term|tenure|duration|score|rank|rating|level|version|sequence|seq|priority|attempts|number_of|no_of|num)($|_)/.test(
      n,
    )
  ) {
    if (/(^|_)age$/.test(n)) return { type: "integer", min: 0, max: 120 };
    if (/(rating)$/.test(n)) return { type: "integer", min: 1, max: 5 };
    return { type: "integer", min: 0 };
  }
  if (
    /(description|notes|note|comments|comment|remarks|reason|summary|body|message|feedback|justification|narrative|explanation|instructions|bio|about)($|_)/.test(
      n,
    )
  )
    return { type: "text" };
  if (/(latitude|longitude|_lat|_lng|_lon)$/.test(n)) return { type: "float" };
  if (/(^|_)(url|website|link|homepage)$/.test(n))
    return { type: "string", semantic: "url", maxLength: 2048 };
  return { type: "string", maxLength: 255 };
}

/* ── Requirement ids ───────────────────────────────────────────────────── */

const REQ_ID =
  /^\s*[[(]?((?:[A-Z]{1,6}[-_.]?)+\d{1,5}(?:[.-]\d{1,4}){0,3})[\])]?\s*[:.)\-–—]?\s+(?=\S)/;

function requirementId(text: string): { id: string | null; rest: string } {
  const m = REQ_ID.exec(text);
  if (m && /[A-Z]/.test(m[1]) && /\d/.test(m[1])) {
    return { id: m[1].replace(/_/g, "-"), rest: text.slice(m[0].length) };
  }
  return { id: null, rest: text };
}

/* ── Prose patterns ────────────────────────────────────────────────────── */

const CARD = String.raw`(one or more|zero or more|zero,? one or more|one or many|many|multiple|several|numerous|any number of|a number of|an unlimited number of|at least one|exactly one|only one|one and only one|a single|one|a|an|up to \d+|no more than \d+|\d+ or more|\d+)`;
const HAVE_VERBS = String.raw`(?:have|has|hold|holds|own|owns|contain|contains|include|includes|place|places|make|makes|submit|submits|open|opens|create|creates|raise|raises|book|books|receive|receives|maintain|maintains|manage|manages|generate|generates|issue|issues|enroll in|enrolls in|enrol in|enrols in|register for|registers for|apply for|applies for|file|files|request|requests|purchase|purchases|buy|buys|write|writes|post|posts|upload|uploads|employ|employs|attend|attends|take|takes|carry|carries|support|supports|be linked to|be associated with|be related to|is linked to|is associated with|are linked to|are associated with|relate to|relates to)`;
const MODAL = String.raw`(?:(?:shall|must|should|will|can|may|could|might|would)\s+(?:only\s+|also\s+|optionally\s+)?(?:be able to\s+)?)?`;
const BELONGS = String.raw`(?:belongs? to|is owned by|are owned by|is placed by|is submitted by|is created by|is raised by|is made by|is issued (?:by|to)|is assigned to|are assigned to|is linked to|is associated with|is tied to|is attached to|references|refers to|is for|relates to|is related to|is part of|falls under|is managed by|is handled by|is booked by|is held by|is opened by|is filed by|is requested by|is written by|is posted by)`;

function isMany(card: string): boolean {
  return (
    /more|many|multiple|several|numerous|number of|up to|^\d+$/.test(card) &&
    !/^(exactly one|only one|one and only one|one|a single|a|an)$/.test(card)
  );
}

function listLike(text: string): boolean {
  return /,|\band\b|\bor\b|;|&/.test(text);
}

/** Shortens an object phrase to its noun ("loans for their home" → "loans"). */
function headNoun(text: string): string {
  return text
    .replace(/\(.*?\)/g, " ")
    .split(
      /\s+(?:and|but|while|which|that|who|whom|where|when|with|for|per|in|on|at|from|via|by|to|under|across|if|unless|as|each|whose)\b|\s*&\s*|[,;:.]/i,
    )[0]
    .trim();
}

function normaliseSentence(raw: string): string {
  return raw
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(
      /^(?:the\s+)?(?:system|application|platform|solution|software|portal|app|tool)\s+(?:shall|must|should|will|can|may)\s+(?:allow|enable|permit|let|support)\s+(?:the\s+)?(?:each\s+|every\s+|a\s+|an\s+)?(.{1,40}?)\s+to\s+/i,
      "$1 can ",
    )
    .replace(/\bbe able to\s+/gi, "")
    .replace(/\bis able to\s+/gi, "can ")
    .replace(/\bare able to\s+/gi, "can ")
    .trim();
}

/* ── Field mentions ────────────────────────────────────────────────────── */

interface Mention {
  entity: Draft;
  field: string;
  index: number;
  length: number;
}

function phrasesFor(field: string): string[] {
  const words = field.replace(/_/g, " ");
  const variants = new Set([words]);
  if (words.endsWith(" id")) variants.add(words.replace(/ id$/, " identifier"));
  if (words === "date of birth") variants.add("dob");
  return [...variants];
}

function findMentions(
  sentence: string,
  b: Builder,
  sectionEntity?: Draft,
): Mention[] {
  const lower = ` ${sentence
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")} `;
  const out: Mention[] = [];
  for (const draft of b.entities.values()) {
    const ename = draft.name.toLowerCase();
    for (const fname of draft.fields.keys()) {
      for (const phrase of phrasesFor(fname)) {
        for (const candidate of [
          `${ename} ${phrase}`,
          `${phrase} of the ${ename}`,
          `${phrase} of a ${ename}`,
          phrase,
        ]) {
          const idx = lower.indexOf(` ${candidate} `);
          if (idx >= 0) {
            const qualified = candidate !== phrase;
            out.push({
              entity: draft,
              field: fname,
              index: idx,
              // Owner-qualified mentions win ties.
              length:
                candidate.length +
                (qualified ? 1000 : 0) +
                (draft === sectionEntity ? 500 : 0),
            });
            break;
          }
        }
      }
    }
  }
  // Longest (most specific) mention per position; a field name owned by
  // several entities resolves to the one the sentence names.
  out.sort((a, b2) => a.index - b2.index || b2.length - a.length);
  const kept: Mention[] = [];
  for (const m of out) {
    const overlapping = kept.find(
      (k) =>
        m.index < k.index + (k.length % 500) &&
        k.index < m.index + (m.length % 500),
    );
    if (!overlapping) {
      const named = out.filter(
        (o) => o.field === m.field && o.index === m.index,
      );
      const best = named.sort((x, y) => y.length - x.length)[0];
      kept.push(best);
    }
  }
  return kept;
}

/* ── Main ──────────────────────────────────────────────────────────────── */

const STATES =
  /\b(shall|must|should|required|mandatory|can|may|will|need|needs|cannot|only)\b/i;

function firstNamedEntity(sentence: string, b: Builder): Draft | null {
  const lower = ` ${sentence.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")} `;
  let best: { draft: Draft; index: number } | null = null;
  for (const d of b.entities.values()) {
    const name = d.name.toLowerCase();
    const m = new RegExp(
      String.raw`\s${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\s`,
    ).exec(lower);
    if (m && (!best || m.index < best.index))
      best = { draft: d, index: m.index };
  }
  return best?.draft ?? null;
}

/** "decision date must be on or after the submitted date": a compare rule. */
function tryComparePredicate(
  ctx: Context,
  draft: Draft,
  field: Field,
  predicate: string,
  req: DocRequirement,
): boolean {
  const comparable = (t: FieldType) =>
    ["date", "datetime", "integer", "decimal", "float", "time"].includes(t);
  for (const [re, op] of COMPARE) {
    const m = new RegExp(
      `${re.source}\\s+(?:the\\s+|its\\s+|their\\s+)?(.{2,40}?)[.;,]?$`,
      "i",
    ).exec(predicate);
    if (!m) continue;
    const other = m[m.length - 1];
    if (/^[$€£₹¥]?\s?-?\d/.test(other)) return false;
    const name = fieldName(other, draft.name);
    if (!name || name === field.name) continue;
    const existing = draft.fields.get(name);
    const spec = existing ? null : typeFromFieldName(name);
    if (!existing && (!spec || !comparable(spec.type))) continue;
    const otherField = existing ?? ctx.b.field(draft, name, req, null, "name");
    if (!comparable(field.type) && !comparable(otherField.type)) continue;
    if (!comparable(field.type)) {
      field.type = otherField.type;
      delete field.maxLength;
    }
    if (!comparable(otherField.type)) return false;
    ctx.b.rule(
      draft,
      { kind: "compare", field: field.name, op, other: name },
      `${field.name} ${op} ${name}`,
      req,
    );
    return true;
  }
  return false;
}

interface Context {
  b: Builder;
  docId: string;
  requirements: DocRequirement[];
  counter: { n: number };
}

function newRequirement(
  ctx: Context,
  text: string,
  section: string,
): DocRequirement {
  const { id, rest } = requirementId(text);
  ctx.counter.n += 1;
  const req: DocRequirement = {
    id: id ?? `DOC-${ctx.counter.n}`,
    docId: ctx.docId,
    text: (id ? rest : text).replace(/\s+/g, " ").trim().slice(0, 320),
    section: section || undefined,
    kind: "other",
    mapped: [],
  };
  // Same id twice (a table and the prose): suffix it.
  if (id && ctx.requirements.some((r) => r.id === req.id)) {
    req.id = `${req.id}#${ctx.counter.n}`;
  }
  ctx.requirements.push(req);
  return req;
}

/** Section headings that name an entity ("3.2 Customer", "Loan Details"). */
function sectionEntityName(heading: string): string | null {
  const t = stripNumbering(heading);
  if (DOC_SECTION.test(t.toLowerCase())) return null;
  return entityPhrase(t);
}

function isDataDictionary(header: string[]): boolean {
  const roles = header.map(roleOf);
  return (
    roles.includes("field") &&
    roles.some(
      (r) =>
        r === "type" ||
        r === "required" ||
        r === "description" ||
        r === "length" ||
        r === "values" ||
        r === "key",
    )
  );
}

function isRequirementsTable(header: string[]): boolean {
  const roles = header.map(roleOf);
  return (
    roles.includes("requirement") ||
    (roles.includes("id") &&
      roles.includes("description") &&
      !roles.includes("field"))
  );
}

function readDescription(
  ctx: Context,
  draft: Draft,
  field: Field,
  text: string,
  req: DocRequirement,
) {
  const lower = text.toLowerCase();
  if (
    /\bunique\b/.test(lower) &&
    !/\bnot unique\b|\bnon[- ]unique\b/.test(lower)
  )
    field.unique = true;
  if (
    /\b(auto[- ]?(generated|incremented|assigned|populated)|system[- ]generated|generated (automatically|by the system)|assigned (automatically|by the system))\b/.test(
      lower,
    )
  ) {
    field.generated = true;
  }
  if (
    /\b(mandatory|required|compulsory|cannot be (empty|blank|null))\b/.test(
      lower,
    ) &&
    !/\b(not|non)[- ](mandatory|required)\b|\bif\b|\bwhen\b/.test(lower)
  ) {
    field.nullable = false;
    draft.explicitNull.set(field.name, false);
  } else if (/\boptional\b|\bnot (mandatory|required)\b/.test(lower)) {
    field.nullable = true;
    draft.explicitNull.set(field.name, true);
  }
  if (!tryComparePredicate(ctx, draft, field, text, req)) {
    applyPredicate(ctx, draft, field, text, req);
  }
}

function readDictionary(
  ctx: Context,
  block: Block,
  sectionDraft: Draft | null,
  caption: string | null,
) {
  const [header, ...rows] = block.rows;
  const roles = header.map(roleOf);
  const col = (role: ColumnRole) => roles.indexOf(role);
  const entityCol = col("entity");
  const fieldCol = col("field");
  // "Name" can be the field column only when no better one exists.
  if (fieldCol < 0) return;
  const owners = new Map<string, Draft>();
  for (const row of rows) {
    const get = (role: ColumnRole) => {
      const i = col(role);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const rawField = row[fieldCol] ?? "";
    if (!rawField.trim() || /^[-–]+$/.test(rawField.trim())) continue;
    let owner = sectionDraft;
    const ownerName =
      entityCol >= 0 ? entityPhrase(row[entityCol] ?? "") : null;
    if (ownerName) {
      owner = owners.get(ownerName) ?? ctx.b.ensure(ownerName, null);
      owners.set(ownerName, owner);
    } else if (!owner && caption) {
      owner = ctx.b.ensure(caption, null);
    }
    if (!owner) {
      ctx.b.warnings.push(
        `A data table in "${block.section || "the document"}" has no entity it belongs to; it was read as "record".`,
      );
      owner = ctx.b.ensure("record", null);
      sectionDraft = owner;
    }
    owner.stub = false;
    const name = fieldName(rawField, owner.name);
    if (!name) continue;
    const rest = row
      .filter((c, i) => c && i !== fieldCol && i !== entityCol)
      .join(" · ");
    const req = newRequirement(
      ctx,
      `${owner.name} — ${rawField.trim()}${rest ? `: ${rest}` : ""}`,
      block.section,
    );
    const typeText = [get("type"), get("length") ? `(${get("length")})` : ""]
      .join(" ")
      .trim();
    let spec = parseTypeSpec(typeText);
    const lengthValue = parseNumber(get("length"));
    if (spec && lengthValue && (spec.type === "string" || spec.type === "enum"))
      spec.maxLength = lengthValue;
    if (!spec && lengthValue) spec = { type: "string", maxLength: lengthValue };
    const isKeyName = name === "id" || name === `${owner.id}_id`;
    const field = ctx.b.field(
      owner,
      isKeyName ? "id" : name,
      req,
      spec,
      "table",
    );
    const key = get("key").toLowerCase();
    if (
      /\bpk\b|primary/.test(key) ||
      (isKeyName && !/\bfk\b|foreign/.test(key))
    ) {
      field.primaryKey = true;
      field.nullable = false;
    }
    if (/\b(uk|unique|ak|alternate)\b/.test(key)) field.unique = true;
    const description = get("description");
    const fkTarget =
      /\bfk\b|foreign/.test(key) ||
      /\b(foreign key|fk)\b|\breferences?\b|\blinks? to\b|\bpoints? to\b/i.test(
        description,
      )
        ? (entityPhrase(
            /(?:fk|foreign key|references?|links? to|points? to)\s*(?:to|:|→|->|-)?\s*(?:the\s+)?([A-Za-z][\w ]{0,40}?)(?:[.(,;]|\s+(?:table|entity|record|id\b)|$)/i.exec(
              `${key} ${description}`,
            )?.[1] ?? "",
          ) ??
          (name.endsWith("_id")
            ? entityPhrase(name.slice(0, -3).replace(/_/g, " "))
            : null))
        : null;
    if (fkTarget && slugId(fkTarget) !== owner.id) {
      ctx.b.relations.push({
        child: owner.id,
        parent: slugId(fkTarget),
        weak: false,
        optional: yes(get("required")) === false,
        many: true,
        field: field.name,
        req,
      });
      ctx.b.ensure(fkTarget, null, true);
    }
    const required = yes(get("required"));
    const nullable = yes(get("nullable"));
    if (required !== null) {
      field.nullable = !required;
      owner.explicitNull.set(field.name, !required);
    } else if (nullable !== null) {
      field.nullable = nullable;
      owner.explicitNull.set(field.name, nullable);
    }
    if (yes(get("unique"))) field.unique = true;
    const values = parseValueList(get("values"));
    if (values) {
      field.type =
        field.type === "integer" && values.every((v) => /^-?\d+$/.test(v))
          ? "integer"
          : "enum";
      field.enumValues = values;
      delete field.maxLength;
    } else if (spec?.type === "enum" && description) {
      const fromDescription =
        /(?:values?|one of|either|options?)\s*(?:are|is|:)?\s*(.+)$/i.exec(
          description,
        )?.[1];
      const parsed = parseValueList(fromDescription ?? description);
      if (parsed) {
        field.enumValues = parsed;
        delete field.maxLength;
      }
    }
    const min = parseNumber(get("min"));
    const max = parseNumber(get("max"));
    if (min !== null) field.min = min;
    if (max !== null) field.max = max;
    const range = /(-?[\d.,$€£k%]+)\s*(?:-|–|to|\.\.)\s*(-?[\d.,$€£k%]+)/i.exec(
      get("range"),
    );
    if (range) {
      const lo = parseNumber(range[1]);
      const hi = parseNumber(range[2]);
      if (lo !== null && hi !== null && lo <= hi) {
        field.min = lo;
        field.max = hi;
      }
    }
    const def = get("default");
    if (def && !/^(none|n\/a|-|null)$/i.test(def)) {
      field.defaultValue =
        field.type === "boolean"
          ? (yes(def) ?? def)
          : field.type === "integer" || field.type === "decimal"
            ? (parseNumber(def) ?? def)
            : def;
    }
    const format =
      get("format") ||
      (spec === null && /[#9X]{2,}|YYYY/.test(get("type")) ? get("type") : "");
    if (format) applyFormat(field, format);
    const pii = get("pii").toLowerCase();
    if (pii && yes(pii) !== false) {
      const cls: PiiClass | null =
        /sensitive|special|health|restricted|secret|high/.test(pii)
          ? "sensitive"
          : /^(y|yes|pii|personal|confidential|direct|true|x)/.test(pii)
            ? "direct"
            : null;
      if (cls) field.pii = cls;
    }
    // Example values only when nothing personal is in them.
    const examples = get("example")
      .split(/\s*[,;]\s*/)
      .map((e) => e.replace(/[“”"']/g, "").trim())
      .filter(Boolean);
    if (examples.length) {
      const personal =
        piiClassOf({
          ...field,
          semantic:
            field.semantic ??
            inferSemantic(field.name, field.type, { entity: owner.name }),
        }) !== "none" ||
        examples.some(
          (e) =>
            detectValue(e) !== null ||
            /\[(email|ssn|card|iban|phone|ip)\]/.test(e),
        );
      if (field.type === "enum" && !field.enumValues?.length) {
        const values = parseValueList(get("example"));
        if (values && !personal) field.enumValues = values;
      } else if (!personal && field.type !== "enum") {
        field.examples = examples.slice(0, 12);
      }
    }
    if (description) {
      field.description = scrubFreeText(description).text.slice(0, 300);
      readDescription(ctx, owner, field, description, req);
    }
  }
}

function applyFormat(field: Field, raw: string) {
  const mask = raw
    .replace(/^(format|pattern)\s*[:=]?\s*/i, "")
    .replace(/[“”"']/g, "")
    .trim();
  if (field.type === "date" || field.type === "datetime") return;
  if (/^(dd|mm|yyyy)[-/.](dd|mm|yyyy)/i.test(mask)) {
    field.type = "date";
    return;
  }
  const numericX =
    /(ssn|social|tax|phone|account|routing|zip|postal|pin|card|number|no$)/.test(
      field.name,
    );
  const pattern = formatMaskToPattern(mask, { numericX });
  if (pattern) {
    field.pattern = pattern;
    if (field.type !== "string") field.type = "string";
    delete field.maxLength;
  }
}

/** Constraints in a predicate about one field ("must be between 1 and 10"). */
function applyPredicate(
  ctx: Context,
  draft: Draft,
  field: Field,
  text: string,
  req: DocRequirement,
): boolean {
  const b = ctx.b;
  const lower = text.toLowerCase();
  let applied = false;
  const numeric =
    field.type === "integer" ||
    field.type === "decimal" ||
    field.type === "float";
  const step = field.type === "integer" ? 1 : 0.01;
  const charUnit = /\s*(characters?|chars?|letters?|digits?|symbols?)\b/;
  const rangeOk = (lo?: number, hi?: number) =>
    lo === undefined || hi === undefined || lo <= hi;

  const between = new RegExp(
    String.raw`between\s+${NUM}\s+(?:and|to|-|–)\s+${NUM}(\s*(?:characters?|chars?|digits?|letters?))?`,
    "i",
  ).exec(text);
  if (between) {
    const lo = parseNumber(between[1]);
    const hi = parseNumber(between[2]);
    if (lo !== null && hi !== null) {
      if (!rangeOk(lo, hi)) {
        b.warnings.push(
          `${req.id}: ${draft.id}.${field.name} range ${lo} > ${hi} ignored`,
        );
      } else if (between[3]) {
        field.maxLength = hi;
        applied = true;
      } else {
        if (!numeric && !/date/.test(field.type)) {
          field.type =
            Number.isInteger(lo) &&
            Number.isInteger(hi) &&
            !/(gpa|rate|ratio|amount|price|balance|fee|cost|salary|weight|height)/.test(
              field.name,
            )
              ? "integer"
              : "decimal";
          if (field.type === "decimal") field.scale = 2;
          delete field.maxLength;
        }
        field.min = lo;
        field.max = hi;
        b.rule(
          draft,
          { kind: "range", field: field.name, min: lo, max: hi },
          `${field.name} between ${lo} and ${hi}`,
          req,
        );
        applied = true;
      }
    }
  }
  const lengthMax =
    /(?:up to|at most|maximum of|max(?:imum)?(?: length)?(?: of)?|no more than|not (?:to )?exceed|cannot exceed|limited to|not longer than)\s+(\d{1,5})\s*(?:characters?|chars?|letters?|digits?)/i.exec(
      text,
    ) ??
    /(\d{1,5})\s+(?:characters?|chars?)\s+(?:max(?:imum)?|or (?:less|fewer))/i.exec(
      text,
    );
  if (lengthMax) {
    field.maxLength = Number(lengthMax[1]);
    if (field.type === "text" && field.maxLength <= 255) field.type = "string";
    applied = true;
  }
  const exactDigits =
    /(?:exactly\s+|must be\s+|be\s+|of\s+|a\s+|consists? of\s+)(\d{1,3})[- ]digits?\b(?!\s+(?:max|or less|or fewer))/i.exec(
      text,
    );
  if (exactDigits && !lengthMax && !between) {
    field.type = "string";
    field.pattern = `^\\d{${exactDigits[1]}}$`;
    delete field.maxLength;
    b.rule(
      draft,
      { kind: "pattern", field: field.name, pattern: field.pattern },
      `${field.name} is ${exactDigits[1]} digits`,
      req,
    );
    applied = true;
  }
  if (!between) {
    const minM = new RegExp(
      String.raw`(?:at least|no less than|not less than|a minimum of|minimum of|minimum|min\.?|greater than or equal to|equal to or greater than|>=|≥|starting (?:at|from))\s+${NUM}`,
      "i",
    ).exec(text);
    const gtM = new RegExp(
      String.raw`(?:greater than|more than|above|over|exceed|exceeds|>)\s+${NUM}`,
      "i",
    ).exec(text);
    const maxM = new RegExp(
      String.raw`(?:at most|no more than|not more than|a maximum of|maximum of|maximum|max\.?|less than or equal to|<=|≤|up to|(?:must|shall|should|can|may|will)?\s*not\s+exceed|cannot exceed|can't exceed|may not exceed|capped at|limited to)\s+${NUM}`,
      "i",
    ).exec(text);
    const ltM = new RegExp(
      String.raw`(?:less than|fewer than|below|under|<)\s+${NUM}`,
      "i",
    ).exec(text);
    const isChar = (m: RegExpExecArray | null) =>
      m &&
      charUnit.test(
        text.slice(m.index + m[0].length, m.index + m[0].length + 14),
      );
    let lo: number | undefined;
    let hi: number | undefined;
    if (minM && !isChar(minM)) lo = parseNumber(minM[1]) ?? undefined;
    else if (
      gtM &&
      !isChar(gtM) &&
      !/not\s+(?:be\s+)?$/.test(lower.slice(0, gtM.index))
    ) {
      const n = parseNumber(gtM[1]);
      if (n !== null) lo = n + step;
    }
    if (maxM && !isChar(maxM)) hi = parseNumber(maxM[1]) ?? undefined;
    else if (ltM && !isChar(ltM)) {
      const n = parseNumber(ltM[1]);
      if (n !== null) hi = n - step;
    }
    if (
      /\b(positive|greater than zero|more than zero|above zero)\b/.test(
        lower,
      ) &&
      lo === undefined
    )
      lo = step;
    if (
      /\b(non[- ]negative|cannot be negative|can ?not be negative|not be negative|must not be negative|zero or (?:more|greater|positive)|0 or more)\b/.test(
        lower,
      ) &&
      lo === undefined
    )
      lo = 0;
    // Ages and durations: "at least 18 years old" on a birth date is a rule
    // the generator cannot express as a range; leave it to the agent.
    const isBirth =
      /birth|dob/.test(field.name) ||
      field.type === "date" ||
      field.type === "datetime";
    if ((lo !== undefined || hi !== undefined) && !isBirth) {
      if (!rangeOk(lo, hi)) {
        b.warnings.push(
          `${req.id}: ${draft.id}.${field.name} range ${lo} > ${hi} ignored`,
        );
      } else {
        if (!numeric) {
          field.type =
            [lo, hi].every((v) => v === undefined || Number.isInteger(v)) &&
            !/amount|price|balance|fee|cost|salary|rate/.test(field.name)
              ? "integer"
              : "decimal";
          if (field.type === "decimal") field.scale = field.scale ?? 2;
          delete field.maxLength;
          delete field.pattern;
        }
        if (lo !== undefined) field.min = lo;
        if (hi !== undefined) field.max = hi;
        b.rule(
          draft,
          { kind: "range", field: field.name, min: lo, max: hi },
          `${field.name}${lo !== undefined ? ` >= ${lo}` : ""}${hi !== undefined ? ` <= ${hi}` : ""}`,
          req,
        );
        applied = true;
      }
    }
  }
  if (
    /\bunique\b/.test(lower) &&
    !/\bnot (?:be )?unique\b|\bnon[- ]unique\b/.test(lower)
  ) {
    field.unique = true;
    applied = true;
  }
  const conditional = /\b(if|when|unless|where|only for|in case)\b/.test(lower);
  if (
    !conditional &&
    /\b(mandatory|required|compulsory)\b|must be (?:provided|entered|captured|specified|supplied|filled|populated|present|recorded)|cannot be (?:empty|blank|null|left blank)|must not be (?:empty|blank|null)/.test(
      lower,
    ) &&
    !/\bnot (?:mandatory|required)\b/.test(lower)
  ) {
    field.nullable = false;
    draft.explicitNull.set(field.name, false);
    applied = true;
  } else if (
    !conditional &&
    /\boptional\b|may be (?:left )?(?:blank|empty)|not (?:mandatory|required)|can be (?:left )?(?:blank|empty)/.test(
      lower,
    )
  ) {
    field.nullable = true;
    draft.explicitNull.set(field.name, true);
    applied = true;
  }
  if (
    /\b(auto[- ]?(generated|incremented|assigned|populated)|system[- ]generated|generated (automatically|by the system)|assigned (automatically|by the system))\b/.test(
      lower,
    )
  ) {
    field.generated = true;
    applied = true;
  }
  const enumM =
    /(?:(?:can|could|may|will)\s+(?:only\s+)?(?:be|have(?: the values?)?|take(?: the values?)?)\s+(?:one of|either|any of|set to|set as)?|(?:must|shall|should)\s+(?:only\s+)?(?:be|have|take)\s+(?:one of|either|any of)|(?:is|are)\s+(?:one of|either|limited to|restricted to)|(?:values?|options?|statuses|types|categories|states|stages|levels|tiers)\s+(?:are|include|is|of)|(?:one of|any of)\s+(?:the following)?|possible values|valid values|allowed values|permitted values|following (?:values|statuses|options|types)|consist of)\s*:?\s*(.{3,400})$/i.exec(
      text,
    );
  if (
    enumM &&
    !between &&
    field.type !== "boolean" &&
    !numeric &&
    !/^(between|at least|at most|more than|less than|greater than|up to|no more|no less)\b/i.test(
      enumM[1].trim(),
    )
  ) {
    const values = parseValueList(enumM[1].split(/(?<=\w)\.\s/)[0]);
    if (values) {
      field.type = "enum";
      field.enumValues = field.enumValues?.length
        ? [...new Set([...field.enumValues, ...values])]
        : values;
      delete field.maxLength;
      applied = true;
    }
  }
  const formatM =
    /(?:in\s+(?:the\s+)?(?:format|form)(?:\s+of)?|follows?\s+(?:the\s+)?(?:format|pattern)|formatted\s+(?:as|like)|format(?:\s+is)?\s*[:=]|^[Ff]ormat\s+|[Pp]attern\s*[:=]|(?:look|looks)\s+like)\s*["']?([A-Z0-9#][A-Z0-9#\-/ .]{1,30}?)["']?(?=[\s,.;)]|$)/.exec(
      text,
    );
  if (formatM) {
    applyFormat(field, formatM[1]);
    if (field.pattern) {
      b.rule(
        draft,
        { kind: "pattern", field: field.name, pattern: field.pattern },
        `${field.name} format ${formatM[1]}`,
        req,
      );
      applied = true;
    }
  }
  const def =
    /\bdefaults?\s+(?:value\s+)?(?:to|is|of|=|:)\s+["']?([\w -]{1,30}?)["']?(?=[\s,.;)]|$)/i.exec(
      text,
    );
  if (def) {
    const v = def[1].trim();
    field.defaultValue =
      field.type === "boolean"
        ? (yes(v) ?? v)
        : numeric
          ? (parseNumber(v) ?? v)
          : v;
    if (
      field.type === "enum" &&
      field.enumValues &&
      !field.enumValues.some((e) => e.toLowerCase() === v.toLowerCase())
    ) {
      field.enumValues = [...field.enumValues, v];
    }
    applied = true;
  }
  return applied;
}

const COMPARE: [RegExp, "<" | "<=" | ">" | ">=" | "=="][] = [
  [
    /(?:must|shall|should|will|can)?\s*(?:not|never)\s+(?:be\s+)?(?:before|earlier than|prior to|less than|lower than|smaller than)/i,
    ">=",
  ],
  [
    /(?:must|shall|should|will|can)?\s*(?:not|never)\s+(?:be\s+)?(?:after|later than|greater than|more than|higher than|exceed|exceeds)/i,
    "<=",
  ],
  [
    /(?:cannot|can't|must not|may not|shall not)\s+(?:be\s+)?(?:before|earlier than|prior to|less than|lower than)/i,
    ">=",
  ],
  [
    /(?:cannot|can't|must not|may not|shall not)\s+(?:be\s+)?(?:after|later than|greater than|more than|exceed)|(?:cannot|can't|must not|may not|shall not)\s+exceed/i,
    "<=",
  ],
  [
    /\b(?:on or after|no earlier than|not earlier than|later than or equal to|greater than or equal to|at least|equal to or (?:after|later than|greater than))\b/i,
    ">=",
  ],
  [
    /\b(?:on or before|no later than|not later than|earlier than or equal to|less than or equal to|at most|up to|within|equal to or (?:before|earlier than|less than))\b/i,
    "<=",
  ],
  [
    /\b(?:after|later than|greater than|more than|higher than|exceed|exceeds|follow|follows|succeed|succeeds)\b/i,
    ">",
  ],
  [
    /\b(?:before|earlier than|prior to|less than|lower than|smaller than|precede|precedes)\b/i,
    "<",
  ],
  [/\b(?:equal to|equals|the same as|match|matches)\b/i, "=="],
];

function tryCompare(
  ctx: Context,
  sentence: string,
  mentions: Mention[],
  req: DocRequirement,
): boolean {
  if (mentions.length < 2) return false;
  for (let i = 0; i < mentions.length - 1; i += 1) {
    const a = mentions[i];
    const c = mentions
      .slice(i + 1)
      .find((m) => m.entity === a.entity && m.field !== a.field);
    if (!c) continue;
    const fa = a.entity.fields.get(a.field)!;
    const fc = a.entity.fields.get(c.field)!;
    const comparable = (f: Field) =>
      ["date", "datetime", "integer", "decimal", "float", "time"].includes(
        f.type,
      );
    if (!comparable(fa) || !comparable(fc)) continue;
    const between = sentence
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .slice(a.index + (a.length % 500), c.index + 1);
    for (const [re, op] of COMPARE) {
      if (re.test(between)) {
        ctx.b.rule(
          a.entity,
          { kind: "compare", field: a.field, op, other: c.field },
          `${a.field} ${op} ${c.field}`,
          req,
        );
        return true;
      }
    }
  }
  return false;
}

function boolValue(v: string): boolean | null {
  if (/^(true|yes|checked|selected|enabled|ticked|on|y)$/i.test(v)) return true;
  if (/^(false|no|unchecked|disabled|off|n)$/i.test(v)) return false;
  return null;
}

function tryImplies(
  ctx: Context,
  sentence: string,
  section: Draft | null,
  req: DocRequirement,
): boolean {
  const s = sentence.replace(/[“”"']/g, "");
  const forward =
    /^(?:if|when|where|in case|whenever|once)\s+(?:the\s+)?(.{2,60}?)\s+(?:is|=|equals|is set to|is marked(?: as)?|is selected as|has (?:a )?(?:value|status) (?:of\s+)?)\s*([\w -]{1,40}?)\s*,\s*(?:then\s+)?(?:the\s+)?(.{2,60}?)\s+(?:must|shall|should|is required to|will|needs? to)\s+(?:also\s+)?(?:be\s+)?([\w -]{1,40}?)[.;]?$/i.exec(
      s,
    );
  const backward =
    /^(?:the\s+)?(.{2,60}?)\s+(?:is|are|becomes|must be|shall be|should be)\s+(mandatory|required|compulsory|captured|provided|entered|recorded|needed)\s+(?:only\s+)?(?:if|when|where|for)\s+(?:the\s+)?(.{2,60}?)\s+(?:is|=|equals|are)\s+([\w -]{1,40}?)[.;]?$/i.exec(
      s,
    );
  let ifPhrase: string;
  let value: string;
  let thenPhrase: string;
  let outcome: string;
  if (forward) [, ifPhrase, value, thenPhrase, outcome] = forward;
  else if (backward) [, thenPhrase, outcome, ifPhrase, value] = backward;
  else return false;
  const resolve = (phrase: string) => {
    const ms = findMentions(phrase, ctx.b, section ?? undefined);
    return ms[0];
  };
  const a = resolve(ifPhrase);
  let t = resolve(thenPhrase);
  if (a && t?.entity !== a.entity) {
    // The required field is new: it lives on the condition's entity.
    const name = fieldName(thenPhrase, a.entity.name);
    if (name && name !== a.field) {
      ctx.b.field(a.entity, name, req, null, "name");
      t = { entity: a.entity, field: name, index: 0, length: 0 };
    }
  }
  if (!a || !t) return false;
  if (a.entity !== t.entity || a.field === t.field) return false;
  const fa = a.entity.fields.get(a.field)!;
  const ft = a.entity.fields.get(t.field)!;
  let inValues: unknown[] | null = null;
  const v = value.trim();
  if (fa.type === "boolean") {
    const bv = boolValue(v);
    if (bv !== null) inValues = [bv];
  } else if (fa.enumValues?.length) {
    const hit = fa.enumValues.find((e) => e.toLowerCase() === v.toLowerCase());
    if (hit) inValues = [hit];
  } else if (fa.type === "string" || fa.type === "enum") {
    // The condition names a value the document never listed: keep it as
    // one of the field's values so the rule can fire.
    fa.type = "enum";
    fa.enumValues = [v];
    delete fa.maxLength;
    inValues = [v];
  }
  if (!inValues) return false;
  const o = outcome.trim().toLowerCase();
  let then: {
    field: string;
    isNull?: boolean;
    in?: unknown[];
    equals?: unknown;
  } | null = null;
  if (
    /^(provided|captured|filled(?: in)?|entered|populated|recorded|set|present|required|mandatory|specified|compulsory|needed|supplied|given|completed)$/.test(
      o,
    )
  ) {
    then = { field: t.field, isNull: false };
    if (
      !a.entity.explicitNull.has(t.field) ||
      a.entity.explicitNull.get(t.field)
    )
      ft.nullable = true;
  } else if (
    /^(blank|empty|null|left blank|cleared|not provided|none)$/.test(o)
  ) {
    then = { field: t.field, isNull: true };
    ft.nullable = true;
  } else if (ft.enumValues?.some((e) => e.toLowerCase() === o)) {
    then = {
      field: t.field,
      equals: ft.enumValues.find((e) => e.toLowerCase() === o),
    };
  } else if (ft.type === "boolean" && boolValue(o) !== null) {
    then = { field: t.field, equals: boolValue(o) };
  }
  if (!then) return false;
  ctx.b.rule(
    a.entity,
    { kind: "implies", if: { field: a.field, in: inValues }, then },
    sentence,
    req,
  );
  return true;
}

/** Subject of a constraint sentence: "Loan amount must ..." → (loan, amount). */
function subjectField(
  ctx: Context,
  sentence: string,
  section: Draft | null,
): { draft: Draft; field: Field; created: boolean; predicate: string } | null {
  const m =
    /^(?:the\s+|a\s+|an\s+|each\s+|every\s+)?(.{2,60}?)\s+(?:shall|must|should|will|can|may|cannot|can't|is|are|has to|have to|needs? to|follows?|uses?)\b/i.exec(
      sentence,
    );
  if (!m) return null;
  const predicate = sentence
    .slice(m.index + m[0].indexOf(m[1]) + m[1].length)
    .trim();
  const subject = m[1]
    .replace(/[’']s\b/g, "")
    .replace(/\bof\s+(?:the|a|an|each)\s+/i, " of ")
    .trim();
  // "the X of the loan" / "loan X" / "X" in the section's entity.
  const ofForm = /^(.+?)\s+of\s+(.+)$/.exec(subject);
  const words = subject.split(/\s+/);
  const candidates: [string, string][] = [];
  if (ofForm) candidates.push([ofForm[2], ofForm[1]]);
  for (let k = Math.min(3, words.length - 1); k >= 1; k -= 1) {
    candidates.push([words.slice(0, k).join(" "), words.slice(k).join(" ")]);
  }
  for (const [ent, rawRest] of candidates) {
    const phrase = entityPhrase(ent);
    const draft = ctx.b.find(phrase);
    if (!draft || !phrase) continue;
    const restWords = rawRest.split(/\s+/);
    restWords[restWords.length - 1] = singularWord(
      restWords[restWords.length - 1],
    );
    let rest = restWords.join(" ");
    // "Application number" of a Loan Application keeps its qualifier, and
    // "course code" is course_code like the data dictionary's "Course Code".
    if (
      (slugId(phrase) !== draft.id &&
        /^(number|no|id|code|reference|ref|date|name|type)$/i.test(rest)) ||
      /^(number|no|code|reference|ref|num)$/i.test(rest)
    ) {
      rest = `${phrase} ${rest}`;
    }
    const name = fieldName(rest, draft.name);
    if (!name || name === draft.id) continue;
    const existing = draft.fields.get(name);
    if (existing) return { draft, field: existing, created: false, predicate };
    return {
      draft,
      field: ctx.b.field(draft, name, null, null, "name"),
      created: true,
      predicate,
    };
  }
  // A field some entity already has ("Employment status is one of ...").
  const loose = fieldName(subject);
  if (loose) {
    const owners = [...ctx.b.entities.values()].filter((d) =>
      d.fields.has(loose),
    );
    const owner =
      owners.length === 1 ? owners[0] : owners.find((d) => d === section);
    if (owner)
      return {
        draft: owner,
        field: owner.fields.get(loose)!,
        created: false,
        predicate,
      };
  }
  if (section && words.length <= 4) {
    const name = fieldName(subject, section.name);
    if (
      name &&
      name !== section.id &&
      !ctx.b.find(entityPhrase(subject) ?? "")
    ) {
      const existing = section.fields.get(name);
      if (existing)
        return { draft: section, field: existing, created: false, predicate };
      return {
        draft: section,
        field: ctx.b.field(section, name, null, null, "name"),
        created: true,
        predicate,
      };
    }
  }
  return null;
}

function attributeItems(text: string): string[] {
  return text
    .replace(/\b(?:etc\.?|and so on|among others)\b/gi, "")
    .split(/\s*(?:,|;|\band\b|&|\bas well as\b|\bplus\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function addAttributes(
  ctx: Context,
  draft: Draft,
  items: string[],
  req: DocRequirement,
): number {
  let added = 0;
  for (const item of items) {
    const name = fieldName(item, draft.name);
    if (!name) continue;
    // An attribute named like another entity is a relation ("a customer").
    const other = ctx.b.find(entityPhrase(item));
    if (other && other !== draft && !other.stub && other.fields.size > 0) {
      ctx.b.relations.push({
        child: draft.id,
        parent: other.id,
        weak: true,
        optional: false,
        many: false,
        req,
      });
      continue;
    }
    const paren = /\(([^)]*)\)/.exec(item)?.[1] ?? "";
    const spec = paren ? parseTypeSpec(paren) : null;
    const field = ctx.b.field(
      draft,
      name === draft.id ? "name" : name,
      req,
      spec,
      "prose",
    );
    const tail = item.slice(
      item.search(/[(:–-]/) >= 0 ? item.search(/[(:–-]/) : item.length,
    );
    if (tail) readDescription(ctx, draft, field, tail, req);
    added += 1;
  }
  return added;
}

function tryAttributes(
  ctx: Context,
  sentence: string,
  section: Draft | null,
  nextList: string[] | null,
  req: DocRequirement,
): boolean {
  const s = sentence.replace(/\s+/g, " ");
  // "The system shall capture the following details for each customer:"
  const capture =
    /^(?:the\s+)?(?:system|application|platform|solution|portal|app)\s+(?:shall|must|should|will)\s+(?:capture|record|store|collect|maintain|hold|keep|track|save|persist|retain)\s+(?:the\s+following\s+)?(?:\w+\s+){0,2}?(?:details|information|data|fields|attributes|properties)?\s*(?:for|about|of|on|against)\s+(?:each|every|a|an|the|all)?\s*(.{2,40}?)\s*(?::\s*(.*))?$/i.exec(
      s,
    );
  // "A customer has a name, email and phone." / "Customer details include: ..."
  const has =
    /^(?:each\s+|every\s+|a\s+|an\s+|the\s+)?(.{2,40}?)\s+(?:record\s+|profile\s+|details\s+|information\s+|data\s+)?(?:shall|must|should|will)?\s*(?:have|has|include|includes|contain|contains|capture|captures|store|stores|consist of|consists of|comprise|comprises|is described by|are described by|requires?|holds?)\s+(?:the\s+following\s*(?:fields|attributes|details|information|data|properties)?|(?:fields|attributes|details|properties)\s+(?:such as|like)?)?\s*:?\s*(.*)$/i.exec(
      s,
    );
  const fieldsOf =
    /^(?:the\s+)?(.{2,40}?)\s+(?:fields|attributes|details|information|data elements|properties)\s+(?:are|include|includes|is|:)\s*:?\s*(.*)$/i.exec(
      s,
    );
  let entityText: string | undefined;
  let listText: string | undefined;
  if (capture) [, entityText, listText] = capture;
  else if (fieldsOf) [, entityText, listText] = fieldsOf;
  else if (has) [, entityText, listText] = has;
  if (!entityText) return false;
  const phrase = entityPhrase(entityText);
  if (!phrase) return false;
  const inline = (listText ?? "").replace(/[.;]$/, "").trim();
  const items = inline && listLike(inline) ? attributeItems(inline) : [];
  const useList =
    (!inline || /:$/.test(s) || /following/i.test(s)) && nextList?.length
      ? nextList
      : null;
  if (!items.length && !useList) return false;
  // "has many accounts" is a relation, handled elsewhere.
  if (
    !useList &&
    new RegExp(String.raw`^${CARD}\s`, "i").test(inline) &&
    isMany(inline.split(" ")[0])
  )
    return false;
  const draft = ctx.b.ensure(phrase, req);
  draft.stub = false;
  const added = addAttributes(ctx, draft, useList ?? items, req);
  return added > 0 || Boolean(useList);
}

function tryRelation(
  ctx: Context,
  sentence: string,
  req: DocRequirement,
): boolean {
  const s = normaliseSentence(sentence).replace(/[.;!]+$/, "");
  const lower = s.toLowerCase();
  // Self reference: "An employee reports to another employee / a manager".
  const self =
    /^(?:each\s+|every\s+|a\s+|an\s+|the\s+)?(.{2,40}?)\s+(?:may\s+|can\s+|must\s+|shall\s+|will\s+)?(?:report|reports) to\s+(?:another|a|an|the|one|their|his|her)?\s*(.{2,30})$/i.exec(
      s,
    );
  if (self) {
    const x = entityPhrase(self[1]);
    const target = entityPhrase(headNoun(self[2]));
    if (
      x &&
      (target === x ||
        target === "manager" ||
        target === "supervisor" ||
        target === "lead")
    ) {
      const d = ctx.b.ensure(x, req);
      ctx.b.relations.push({
        child: d.id,
        parent: d.id,
        weak: false,
        optional: true,
        many: true,
        field: "manager_id",
        req,
      });
      return true;
    }
  }
  const parent = /\b(?:parent|sub[- ]?category|subcategory|child)\b/.exec(
    lower,
  );
  if (parent) {
    const m =
      /^(?:each\s+|every\s+|a\s+|an\s+|the\s+)?(.{2,40}?)\s+(?:may|can|must|shall|will)?\s*(?:have|has)\s+(?:a|an|one|an optional)?\s*parent\s+(.{2,40})$/i.exec(
        s,
      );
    if (m) {
      const x = entityPhrase(m[1]);
      const target = entityPhrase(headNoun(m[2]));
      if (x && target === x) {
        const d = ctx.b.ensure(x, req);
        ctx.b.relations.push({
          child: d.id,
          parent: d.id,
          weak: false,
          optional: true,
          many: true,
          field: "parent_id",
          req,
        });
        return true;
      }
    }
  }
  const m2m =
    /^(?:a|an|the)?\s*(.{2,40}?)\s+and\s+(?:a|an|the)?\s*(.{2,40}?)\s+(?:have|has|share|are in)\s+(?:a\s+)?many[- ]to[- ]many\b/i.exec(
      s,
    );
  if (m2m) {
    const x = entityPhrase(m2m[1]);
    const y = entityPhrase(m2m[2]);
    if (x && y && x !== y) {
      const dx = ctx.b.ensure(x, req, true);
      const dy = ctx.b.ensure(y, req, true);
      ctx.b.relations.push({
        child: dy.id,
        parent: dx.id,
        weak: false,
        optional: false,
        many: true,
        req,
      });
      ctx.b.relations.push({
        child: dx.id,
        parent: dy.id,
        weak: false,
        optional: false,
        many: true,
        req,
      });
      return true;
    }
  }
  const has = new RegExp(
    String.raw`^(?:each|every|a|an|one|any|the)?\s*(.{2,40}?)\s+${MODAL}${HAVE_VERBS}\s+${CARD}\s+(.{2,80})$`,
    "i",
  ).exec(s);
  if (has) {
    const x = entityPhrase(has[1]);
    const card = has[2].toLowerCase();
    const objectText = has[3];
    const many = isMany(card);
    if (x && !(listLike(headNoun(objectText)) && !many)) {
      const y = entityPhrase(headNoun(objectText));
      if (y && y !== x) {
        // "has a status" is an attribute, "has a branch" a relation: known
        // entities and nouns without a data meaning are relations.
        const yKnown = ctx.b.find(y);
        const attributeLike =
          !many && !yKnown && typeFromFieldName(slugId(y)).type !== "string";
        const semantic = inferSemantic(slugId(y), "string");
        if (
          !attributeLike &&
          (many || yKnown || semantic === "generic" || semantic === "title")
        ) {
          const dx = ctx.b.ensure(x, req, true);
          const dy = ctx.b.ensure(y, req, true);
          const optional =
            /zero|optionally|\bmay\b|\bcan\b/.test(lower) && !many;
          if (many) {
            ctx.b.relations.push({
              child: dy.id,
              parent: dx.id,
              weak: false,
              optional: false,
              many: true,
              req,
            });
          } else {
            ctx.b.relations.push({
              child: dx.id,
              parent: dy.id,
              weak: true,
              optional,
              many: false,
              req,
            });
          }
          return true;
        }
        if (!many) {
          const dx = ctx.b.ensure(x, req);
          ctx.b.field(dx, slugId(y), req, null, "name");
          return true;
        }
      }
    }
  }
  const belongs = new RegExp(
    String.raw`^(?:each|every|a|an|one|any|the)?\s*(.{2,40}?)\s+(?:(?:shall|must|should|will|can|may|could)\s+(?:only\s+|always\s+|optionally\s+)?(?:be\s+)?)?${BELONGS}\s+(?:exactly one|one and only one|only one|one|a single|a|an|the|one or more|an existing|a valid|at most one)?\s*(.{2,60})$`,
    "i",
  ).exec(s);
  if (belongs) {
    const y = entityPhrase(belongs[1]);
    let x = entityPhrase(headNoun(belongs[2]));
    let field: string | undefined;
    // "managed by a branch manager, who is an employee": a role of another entity.
    const role =
      /,?\s*(?:who|which|that)\s+(?:is|are|must be)\s+(?:also\s+)?(?:an?|the)\s+(.{2,40})$/i.exec(
        belongs[2],
      );
    const roleOf = role ? entityPhrase(headNoun(role[1])) : null;
    if (x && roleOf && roleOf !== x) {
      field = `${slugId(x)}_id`;
      x = roleOf;
    }
    if (x && y && x !== y) {
      const dy = ctx.b.ensure(y, req, true);
      const dx = ctx.b.ensure(x, req, true);
      const optional = /\b(may|can|optionally|could|at most)\b/.test(
        lower.slice(0, lower.indexOf(belongs[2].toLowerCase())),
      );
      ctx.b.relations.push({
        child: dy.id,
        parent: dx.id,
        weak: false,
        optional,
        many: true,
        field,
        req,
      });
      return true;
    }
  }
  return false;
}

/** Relations → foreign keys, join entities for many-to-many, stub parents. */
function resolveRelations(b: Builder) {
  const key = (r: Relation) => `${r.child}->${r.parent}`;
  const strong = new Map<string, Relation>();
  const weak = new Map<string, Relation>();
  for (const r of b.relations) {
    if (!b.entities.has(r.parent) || !b.entities.has(r.child)) continue;
    (r.weak ? weak : strong).set(key(r), r);
  }
  const done = new Set<string>();
  const joins: [Relation, Relation][] = [];
  for (const r of strong.values()) {
    if (r.child === r.parent) continue;
    const reverse = strong.get(`${r.parent}->${r.child}`);
    if (reverse && r.many && reverse.many && !done.has(key(reverse))) {
      joins.push([r, reverse]);
      done.add(key(r));
      done.add(key(reverse));
    }
  }
  const unique = new Set<string>();
  for (const w of weak.values()) {
    const reverse = strong.get(`${w.parent}->${w.child}`);
    if (reverse) {
      // "Each customer has one profile" + "a profile belongs to one
      // customer": one-to-one, the key lives on the profile.
      unique.add(key(reverse));
      continue;
    }
    if (!strong.has(key(w))) strong.set(key(w), w);
  }
  for (const r of strong.values()) {
    if (done.has(key(r))) continue;
    const child = b.entities.get(r.child)!;
    const parent = b.entities.get(r.parent)!;
    const name =
      r.field ?? (r.child === r.parent ? "parent_id" : `${parent.id}_id`);
    const existing = child.fields.get(name);
    const fk: Field = existing ?? { name, type: "uuid" };
    fk.references = { entity: parent.id, field: "id" };
    fk.semantic = "id";
    delete fk.enumValues;
    delete fk.maxLength;
    delete fk.min;
    delete fk.max;
    delete fk.pattern;
    if (r.child === r.parent || r.optional || r.weak)
      fk.nullable = r.child === r.parent || r.optional;
    else if (!child.explicitNull.get(name)) fk.nullable = false;
    if (unique.has(key(r))) fk.unique = true;
    child.fields.set(name, fk);
    child.typeFrom.set(name, "table");
    if (!r.req.mapped.includes(`relation:${child.id}.${name}`))
      r.req.mapped.push(`relation:${child.id}.${name}`);
    r.req.kind = "data";
    child.evidence.add(`${r.req.id}`);
  }
  // Two entities whose keys point at each other: the weaker side gives way.
  for (const a of b.entities.values()) {
    for (const f of a.fields.values()) {
      if (!f.references || f.references.entity === a.id || f.nullable) continue;
      const other = b.entities.get(f.references.entity);
      const back =
        other &&
        [...other.fields.values()].find(
          (g) => g.references?.entity === a.id && !g.nullable,
        );
      if (back) back.nullable = true;
    }
  }
  for (const [r, reverse] of joins) {
    const x = b.entities.get(r.parent)!;
    const y = b.entities.get(r.child)!;
    const [first, second] = [x, y].sort((p, q) => p.id.localeCompare(q.id));
    const id = `${first.id}_${second.id}`.slice(0, 64);
    if (b.entities.has(id)) continue;
    const join: Draft = {
      id,
      name: `${first.name} ${second.name}`,
      fields: new Map(),
      typeFrom: new Map(),
      explicitNull: new Map(),
      evidence: new Set([
        `${b.docName} ${r.req.id}`,
        `${b.docName} ${reverse.req.id}`,
      ]),
      description: `Links ${first.name} and ${second.name} (many-to-many in the document).`,
      stub: false,
      uniqueTogether: [[`${first.id}_id`, `${second.id}_id`]],
    };
    join.fields.set(`${first.id}_id`, {
      name: `${first.id}_id`,
      type: "uuid",
      semantic: "id",
      nullable: false,
      references: { entity: first.id, field: "id" },
    });
    join.fields.set(`${second.id}_id`, {
      name: `${second.id}_id`,
      type: "uuid",
      semantic: "id",
      nullable: false,
      references: { entity: second.id, field: "id" },
    });
    b.entities.set(id, join);
    for (const req of [r.req, reverse.req]) {
      if (!req.mapped.includes(`entity:${id}`)) req.mapped.push(`entity:${id}`);
      req.kind = "data";
    }
  }
}

function finalise(b: Builder): Entity[] {
  const out: Entity[] = [];
  const referenced = new Set(
    [...b.entities.values()].flatMap((d) =>
      [...d.fields.values()].flatMap((f) =>
        f.references ? [f.references.entity] : [],
      ),
    ),
  );
  for (const d of b.entities.values()) {
    // A section heading that looked like an entity but never got anything.
    if (d.fields.size === 0 && d.evidence.size === 0 && !referenced.has(d.id)) {
      continue;
    }
    // A key every entity has; a declared "<entity> ID" is that key.
    let pk = [...d.fields.values()].find((f) => f.primaryKey);
    if (!pk) {
      const declared = d.fields.get("id");
      if (declared && !declared.references) {
        pk = declared;
      } else {
        pk = { name: "id", type: "uuid" };
        const rest = [...d.fields.entries()].filter(([n]) => n !== "id");
        d.fields = new Map([["id", pk], ...rest]);
      }
      pk.primaryKey = true;
    }
    pk.nullable = false;
    pk.semantic = "id";
    if (!["uuid", "integer", "string"].includes(pk.type)) pk.type = "uuid";
    delete pk.enumValues;
    if (pk.type === "string" && !pk.pattern) {
      pk.type = "uuid";
      delete pk.maxLength;
    }
    // FK types follow their parent's key.
    if (
      !d.uniqueTogether.length &&
      [...d.fields.values()].every(
        (f) => f.primaryKey || f.references || f.name === "id",
      )
    ) {
      d.fields.set("name", { name: "name", type: "string", maxLength: 255 });
      d.description ??=
        "Mentioned in the document without attributes; refine with the agent.";
    }
    const fields = [...d.fields.values()].map((f) => {
      const field = { ...f };
      if (field.type === "enum" && !field.enumValues?.length) {
        field.type = "string";
        field.maxLength ??= 64;
      }
      // Examples of a formatted or unique column are illustrations only.
      if (field.pattern || field.unique) delete field.examples;
      if (
        field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max
      ) {
        delete field.min;
        delete field.max;
      }
      if (
        field.nullable === undefined &&
        !field.primaryKey &&
        !field.references
      ) {
        // Documents rarely say "optional": unmarked fields stay required
        // unless the document called something optional nearby.
        field.nullable = false;
      }
      return field;
    });
    out.push({
      id: d.id,
      name: d.name,
      description: d.description,
      fields,
      evidence: [...d.evidence].slice(0, 30),
      source: "manual",
      uniqueTogether: d.uniqueTogether.length ? d.uniqueTogether : undefined,
    });
  }
  const byId = new Map(out.map((e) => [e.id, e]));
  for (const e of out) {
    for (const f of e.fields) {
      if (!f.references) continue;
      const parentPk = byId
        .get(f.references.entity)
        ?.fields.find((x) => x.primaryKey);
      if (parentPk) {
        f.type = parentPk.type;
        f.references = { entity: f.references.entity, field: parentPk.name };
      }
    }
  }
  return out;
}

export interface ExtractOptions {
  /** Shown in evidence and requirement ids ("BRD-Loans.docx"). */
  docName?: string;
  docId?: string;
}

export function extractFromDocument(
  rawText: string,
  options: ExtractOptions = {},
): DocumentExtraction {
  const docName = options.docName ?? "document";
  const docId = options.docId ?? slugId(docName) ?? "doc";
  const scrub = scrubFreeText(rawText.replace(/\r\n?/g, "\n"));
  const text = scrub.text;
  const b = new Builder(docName);
  const ctx: Context = { b, docId, requirements: [], counter: { n: 0 } };
  const blocks = toBlocks(text);
  if (personalNote(scrub.found)) {
    b.warnings.push(personalNote(scrub.found)!);
  }

  // Pass 1: entities named by headings that own data (a table or a list).
  const sectionEntity = new Map<string, string>();
  blocks.forEach((block, i) => {
    if (block.kind !== "heading") return;
    const phrase = sectionEntityName(block.text);
    if (!phrase) return;
    const next =
      blocks
        .slice(i + 1, i + 4)
        .find((x) => x.kind !== "para" || /:$/.test(x.text)) ?? blocks[i + 1];
    const ownsData =
      (next?.kind === "table" && isDataDictionary(next.rows[0] ?? [])) ||
      next?.kind === "list" ||
      ENTITY_SUFFIX.test(` ${block.text}`) ||
      /\b(entity|table|object)\b/i.test(block.text);
    if (ownsData) sectionEntity.set(block.section, phrase);
  });

  const sectionDraft = (section: string): Draft | null => {
    const phrase = sectionEntity.get(section);
    return phrase ? b.ensure(phrase, null) : null;
  };

  // Pass 2: data dictionaries, attribute lists and relations.
  const sentences: { text: string; section: string; req: DocRequirement }[] =
    [];
  blocks.forEach((block, i) => {
    if (block.kind === "table") {
      const header = block.rows[0] ?? [];
      if (isDataDictionary(header)) {
        const prev = blocks[i - 1];
        const caption =
          prev?.kind === "para"
            ? (/^(?:table\s*[\d.]*\s*[:.-]?\s*)?(.{2,40}?)\s*(?:fields|attributes|data dictionary|data elements|columns|table)?\s*:?$/i.exec(
                prev.text,
              )?.[1] ?? null)
            : null;
        readDictionary(
          ctx,
          block,
          sectionDraft(block.section),
          caption ? entityPhrase(caption) : null,
        );
        return;
      }
      if (isRequirementsTable(header)) {
        const roles = header.map(roleOf);
        const idCol = roles.indexOf("id");
        const textCol =
          roles.indexOf("requirement") >= 0
            ? roles.indexOf("requirement")
            : roles.indexOf("description");
        for (const row of block.rows.slice(1)) {
          const body = row[textCol] ?? "";
          if (!body.trim()) continue;
          const reqText =
            idCol >= 0 && row[idCol] ? `${row[idCol]}: ${body}` : body;
          const req = newRequirement(ctx, reqText, block.section);
          for (const sentence of splitSentences(body)) {
            sentences.push({ text: sentence, section: block.section, req });
          }
        }
        return;
      }
      // Any other table: each row is a requirement-like line.
      for (const row of block.rows.slice(1)) {
        const line = row.filter(Boolean).join(" — ");
        if (line.length > 8)
          sentences.push({
            text: line,
            section: block.section,
            req: newRequirement(ctx, line, block.section),
          });
      }
      return;
    }
    if (block.kind === "list") {
      const prev = blocks[i - 1];
      const leadIn =
        prev?.kind === "para" && /:\s*$/.test(prev.text)
          ? prev.text
          : prev?.kind === "heading"
            ? prev.text
            : "";
      const owner = sectionDraft(block.section);
      const leadEntity = leadIn
        ? entityPhrase(
            /(?:for|of|about)\s+(?:each|every|a|an|the)?\s*([\w ]{2,40}?)\s*:?\s*$/i.exec(
              leadIn,
            )?.[1] ?? leadIn.replace(/:$/, ""),
          )
        : null;
      // Items that read like field names ("Policy Number (12)"), not
      // requirements ("FR-1: Each policy can have many claims").
      const fieldLike =
        block.items.filter(
          (it) => !requirementId(it).id && fieldName(it) !== null,
        ).length >=
        block.items.length * 0.6;
      const fieldList =
        fieldLike &&
        (/\b(fields?|attributes?|details|information|data|properties|following)\b/i.test(
          leadIn,
        ) ||
          (prev?.kind === "heading" && owner));
      const target = fieldList
        ? leadEntity
          ? b.ensure(leadEntity, null)
          : owner
        : null;
      if (target && block.items.every((it) => it.length < 160)) {
        const req = newRequirement(
          ctx,
          `${leadIn || target.name} ${block.items.join("; ")}`.slice(0, 320),
          block.section,
        );
        target.stub = false;
        addAttributes(ctx, target, block.items, req);
        // Items can still carry constraints ("Status: Active, Closed").
        for (const item of block.items) {
          const colon = /^([^:–-]{2,60})\s*[:–-]\s+(.+)$/.exec(item);
          if (colon) {
            const fname = fieldName(colon[1], target.name);
            const f = fname ? target.fields.get(fname) : undefined;
            if (f) {
              const values = parseValueList(colon[2]);
              if (
                values &&
                /(status|type|category|stage|state|level|tier|kind|class|mode|method|channel|priority|frequency|gender|role)$/.test(
                  f.name,
                )
              ) {
                f.type = "enum";
                f.enumValues = values;
                delete f.maxLength;
              }
            }
          }
        }
        return;
      }
      for (const item of block.items) {
        sentences.push({
          text: item,
          section: block.section,
          req: newRequirement(ctx, item, block.section),
        });
      }
      return;
    }
    if (block.kind === "para") {
      const next = blocks[i + 1];
      if (
        /:\s*$/.test(block.text) &&
        next?.kind === "list" &&
        /\b(fields?|attributes?|details|information|data|properties|following)\b/i.test(
          block.text,
        )
      ) {
        // The list below carries this lead-in in its own requirement.
        const lead = splitSentences(block.text);
        for (const sentence of lead.slice(0, -1)) {
          sentences.push({
            text: sentence,
            section: block.section,
            req: newRequirement(ctx, sentence, block.section),
          });
        }
        return;
      }
      // "US-12: As an adjuster ... Each claim can have many assessments."
      // is one requirement however many sentences it has; untagged
      // sentences each stand alone.
      const groups: string[][] = [];
      for (const sentence of splitSentences(block.text)) {
        const last = groups[groups.length - 1];
        if (last && !requirementId(sentence).id && requirementId(last[0]).id) {
          last.push(sentence);
        } else {
          groups.push([sentence]);
        }
      }
      for (const group of groups) {
        const req = newRequirement(ctx, group.join(" "), block.section);
        for (const sentence of group) {
          sentences.push({ text: sentence, section: block.section, req });
        }
      }
    }
  });

  // Attributes and relations first (they create the fields constraints
  // talk about), then constraints.
  for (const s of sentences) {
    const { rest } = requirementId(s.text);
    const nextBlockList = (() => {
      if (!/:\s*$/.test(rest)) return null;
      const idx = blocks.findIndex(
        (blk) => blk.kind === "para" && blk.text.endsWith(rest.trim()),
      );
      const nextBlock = idx >= 0 ? blocks[idx + 1] : undefined;
      return nextBlock?.kind === "list" ? nextBlock.items : null;
    })();
    if (!tryRelation(ctx, rest, s.req)) {
      tryAttributes(
        ctx,
        normaliseSentence(rest),
        sectionDraft(s.section),
        nextBlockList,
        s.req,
      );
    }
  }
  let focus: Draft | null = null;
  let focusSection = "";
  for (const s of sentences) {
    const { rest } = requirementId(s.text);
    const sentence = normaliseSentence(rest);
    if (s.section !== focusSection) {
      focus = null;
      focusSection = s.section;
    }
    // The entity a run of sentences is about: the first one a sentence
    // names, kept until another is named ("The requested amount ...").
    const named = firstNamedEntity(sentence, b);
    if (named) focus = named;
    const section = sectionDraft(s.section) ?? focus;
    if (tryImplies(ctx, sentence, section, s.req)) continue;
    const mentions = findMentions(sentence, b, section ?? undefined);
    if (tryCompare(ctx, sentence, mentions, s.req)) continue;
    // "no two customers can share the same email"
    const noTwo =
      /no two\s+(.{2,40}?)\s+(?:can|may|should|shall|must|will)\s+(?:have|share|use)\s+the same\s+(.{2,40})/i.exec(
        sentence,
      );
    if (noTwo) {
      const d = b.find(entityPhrase(noTwo[1]));
      const name = d ? fieldName(headNoun(noTwo[2]), d.name) : null;
      if (d && name) {
        const f = b.field(d, name, s.req, null, "name");
        f.unique = true;
        continue;
      }
    }
    const subject = subjectField(ctx, sentence, section);
    if (subject) {
      const applied =
        tryComparePredicate(
          ctx,
          subject.draft,
          subject.field,
          subject.predicate,
          s.req,
        ) ||
        applyPredicate(
          ctx,
          subject.draft,
          subject.field,
          subject.predicate || sentence,
          s.req,
        );
      if (applied) {
        b.cite(
          subject.draft,
          s.req,
          `field:${subject.draft.id}.${subject.field.name}`,
        );
        continue;
      }
      if (subject.created) subject.draft.fields.delete(subject.field.name);
    }
    if (mentions.length) {
      const m = mentions[0];
      const f = m.entity.fields.get(m.field)!;
      if (applyPredicate(ctx, m.entity, f, sentence.slice(m.index), s.req)) {
        b.cite(m.entity, s.req, `field:${m.entity.id}.${m.field}`);
        continue;
      }
      // Mentions data without a constraint we can enforce: still data,
      // when it states something (a requirement, not a remark).
      if (STATES.test(sentence) || !s.req.id.startsWith("DOC-"))
        s.req.kind = "data";
    } else if (
      named &&
      (STATES.test(sentence) || !s.req.id.startsWith("DOC-"))
    ) {
      s.req.kind = "data";
    }
  }

  resolveRelations(b);
  const entities = finalise(b);
  // Rules that point at fields the final model no longer has are dropped.
  const rules = b.rules.filter((r) => {
    const e = entities.find((x) => x.id === r.entity);
    if (!e) return false;
    const names = new Set(e.fields.map((f) => f.name));
    const spec = r.spec;
    switch (spec.kind) {
      case "implies":
        return names.has(spec.if.field) && names.has(spec.then.field);
      case "compare":
        return names.has(spec.field) && names.has(spec.other);
      case "unique_together":
        return spec.fields.every((f) => names.has(f));
      default:
        return names.has(spec.field);
    }
  });
  if (entities.length === 0) {
    b.warnings.push(
      "No data entities were found in the document. The agent will read it and propose a model.",
    );
  }
  const requirements = ctx.requirements.filter((r) => r.text.length >= 8);
  return {
    entities,
    rules,
    requirements,
    warnings: [...new Set(b.warnings)].slice(0, 40),
    personalValuesRemoved: scrub.found,
    text,
  };
}

function personalNote(found: number): string | null {
  return found > 0
    ? `${found} personal value${found === 1 ? "" : "s"} (emails, phone numbers, IDs, card numbers) in the document ${found === 1 ? "was" : "were"} removed before anything was kept.`
    : null;
}

/** Share of data requirements that became part of the model. */
export function requirementCoverage(
  requirements: DocRequirement[],
  evidence: string[] = [],
): { data: number; covered: number; uncovered: DocRequirement[] } {
  const cited = evidence.join(" \n ");
  const data = requirements.filter((r) => r.kind === "data");
  const uncovered = data.filter(
    (r) =>
      r.mapped.length === 0 &&
      !new RegExp(
        String.raw`(^|[\s(])${r.id.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&")}($|[\s),:;])`,
      ).test(cited),
  );
  return {
    data: data.length,
    covered: data.length - uncovered.length,
    uncovered,
  };
}
