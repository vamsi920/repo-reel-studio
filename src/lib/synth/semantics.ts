import type { Field, FieldType, PiiClass, SemanticKind } from "./model";
import {
  PERSON_ENTITY,
  PERSONAL_MONEY,
  PII_KINDS,
  piiClassOfSemantic,
} from "./pii-catalog";

/**
 * Guess what a field means from its name and type (and, when given, the
 * column's description and the entity it belongs to). Personal-data rules
 * from the PII catalog run first, most specific first; then the generic
 * rules. The agent or the user can always override `semantic`.
 */
const GENERIC_RULES: [RegExp, SemanticKind][] = [
  [/(avatar|image|photo|picture|thumbnail|logo)_?(url)?$/i, "image_url"],
  [/(url|link|href|website|homepage|endpoint)/i, "url"],
  [/(uuid|guid)/i, "uuid"],
  [/slug|permalink/i, "slug"],
  [/(city|town)/i, "city"],
  [/(state|province|region)(_code|_name)?$/i, "state"],
  [/country_?code|iso_?country/i, "country_code"],
  [/country/i, "country"],
  [/(lat|latitude)$/i, "latitude"],
  [/(lng|lon|long|longitude)$/i, "longitude"],
  [/currency(_code)?$/i, "currency_code"],
  [/(price|unit_cost|cost|fee|rate_amount|msrp)/i, "price"],
  [
    /(amount|total|subtotal|balance|salary|revenue|budget|income|wage|tax$|discount$)/i,
    "amount",
  ],
  [/(percent|pct|ratio|share)/i, "percentage"],
  [/(quantity|qty|units|stock|inventory)/i, "quantity"],
  [/(count|num_|number_of|_total$|views|likes|followers)/i, "count"],
  [/^age$|(^|_)age($|_)/i, "age"],
  [/^year$/i, "year"],
  [/created|inserted|registered|joined|signup/i, "created_at"],
  [/updated|modified|changed|last_seen|last_login/i, "updated_at"],
  [/deleted|removed|archived_at|cancelled_at/i, "deleted_at"],
  [
    /(expires?|expiry|due|scheduled|ends?_at|end_date|valid_until)/i,
    "date_future",
  ],
  [/(_at|_on|date|time|timestamp)$/i, "date_past"],
  [
    /(company|organization|organisation|org_name|employer|vendor|supplier|merchant)/i,
    "company",
  ],
  [/(job|position|role_title|occupation|profession)/i, "job_title"],
  [/(status|state$|stage|phase)/i, "status"],
  [/colou?r/i, "color"],
  [/(sku|part_number|product_code|barcode|upc|ean)/i, "sku"],
  [
    /(token|secret|api_?key|session_id|refresh|private_?key|access_?key)/i,
    "token",
  ],
  [/(locale|language|lang)$/i, "locale"],
  [/(timezone|tz)$/i, "timezone"],
  [/(mime|content_type)/i, "mime_type"],
  [/(file_?name|filename|attachment|path)/i, "file_name"],
  [/version/i, "version"],
  [/(sha|checksum|digest|fingerprint|etag|hash)/i, "hash"],
  [/(title|subject|headline|heading)/i, "title"],
  [
    /(description|summary|bio|about|notes?|comment|body|content|message|text|remarks?|memo|feedback|reason)/i,
    "description",
  ],
  [
    /(is_|has_|can_|should_|enabled|active|verified|deleted$|published|archived|flag)/i,
    "boolean",
  ],
];

/** PII meanings a numeric column can legitimately hold. */
const NUMERIC_PII: readonly SemanticKind[] = [
  "card_cvv",
  "pin",
  "credit_score",
  "bank_account",
  "routing_number",
  "card_number",
  "ssn",
  "phone",
  "employee_id",
  "student_id",
  "medical_record_number",
  "insurance_number",
  "postal_code",
];

const COUNT_LIKE =
  /(_count|count_|_total|total_|num_of|number_of|_num$|^num_|_qty|_sum)/i;

function snake(text: string): string {
  return text
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function piiRuleFor(text: string, type: FieldType): SemanticKind | null {
  const numeric = type === "integer" || type === "float" || type === "decimal";
  for (const kind of PII_KINDS) {
    if (!kind.rule.test(text)) continue;
    if (
      numeric &&
      (!NUMERIC_PII.includes(kind.semantic) || COUNT_LIKE.test(text))
    ) {
      continue;
    }
    if (
      (kind.semantic === "birthdate" || kind.semantic === "date_of_death") &&
      numeric
    ) {
      continue;
    }
    return kind.semantic;
  }
  return null;
}

export interface SemanticHints {
  /** Column comment / doc, used when the name says little. */
  description?: string;
  /** Entity the column belongs to (a product's `name` is not a person). */
  entity?: string;
}

export function inferSemantic(
  name: string,
  type: FieldType,
  hints: SemanticHints = {},
): SemanticKind {
  if (/^(id|pk|_id|uid)$/i.test(name)) return "id";
  if (type === "boolean") return "boolean";
  if (type === "uuid") return name === "id" ? "id" : "uuid";
  if (type === "json") return "json";
  // A thing's name or title is not a person's name.
  if (/^(name|title)$/i.test(name)) {
    return hints.entity && !PERSON_ENTITY.test(hints.entity)
      ? "title"
      : "full_name";
  }
  const pii = piiRuleFor(name, type);
  if (pii) return pii;
  for (const [pattern, kind] of GENERIC_RULES) {
    if (!pattern.test(name)) continue;
    // The type wins over a name that does not fit it.
    if (
      (kind === "created_at" ||
        kind === "updated_at" ||
        kind === "deleted_at" ||
        kind === "date_past" ||
        kind === "date_future") &&
      (type === "integer" || type === "float" || type === "decimal")
    ) {
      continue;
    }
    if (
      (kind === "price" ||
        kind === "amount" ||
        kind === "count" ||
        kind === "quantity" ||
        kind === "age" ||
        kind === "percentage") &&
      (type === "date" || type === "datetime")
    ) {
      continue;
    }
    if (kind === "boolean" && (type as FieldType) !== "unknown") {
      continue;
    }
    // A generic word meaning; a description may still reveal personal data.
    if (
      hints.description &&
      (kind === "description" || kind === "title" || kind === "count")
    ) {
      const fromDescription = piiRuleFor(snake(hints.description), type);
      if (fromDescription) return fromDescription;
    }
    return kind;
  }
  if (hints.description) {
    const fromDescription = piiRuleFor(snake(hints.description), type);
    if (fromDescription) return fromDescription;
  }
  switch (type) {
    case "date":
    case "datetime":
      return "date_past";
    case "time":
      return "date_past";
    case "integer":
      return "count";
    case "float":
    case "decimal":
      return "amount";
    case "text":
      return "paragraph";
    case "enum":
      return "status";
    default:
      return "generic";
  }
}

/** Special-category rules that make even a boolean column sensitive. */
const SENSITIVE_BY_NAME: readonly SemanticKind[] = [
  "health_condition",
  "special_category",
  "biometric",
  "blood_type",
];

/** Privacy class for a field: its explicit `pii`, else from its meaning. */
export function piiClassOf(field: Field): PiiClass {
  if (field.pii) return field.pii;
  const semantic =
    field.semantic ??
    inferSemantic(field.name, field.type, { description: field.description });
  const cls = piiClassOfSemantic(semantic);
  if (cls !== "none") return cls;
  const byName = PII_KINDS.find(
    (k) =>
      SENSITIVE_BY_NAME.includes(k.semantic) &&
      (k.rule.test(field.name) ||
        (field.description ? k.rule.test(snake(field.description)) : false)),
  );
  if (byName) return byName.cls;
  if (
    (semantic === "amount" || semantic === "price" || semantic === "count") &&
    PERSONAL_MONEY.test(field.name)
  ) {
    return "sensitive";
  }
  return "none";
}

/** Fill in `semantic` for every field that lacks one. Pure. */
export function withInferredSemantics<
  T extends { fields: Field[]; name?: string; id?: string },
>(entity: T): T {
  const entityName = entity.name ?? entity.id;
  return {
    ...entity,
    fields: entity.fields.map((f) =>
      f.semantic
        ? f
        : {
            ...f,
            semantic: inferSemantic(f.name, f.type, {
              description: f.description,
              entity: entityName,
            }),
          },
    ),
  };
}

/** Map an arbitrary type word (SQL, Prisma, JSON Schema, ORM) onto FieldType. */
export function normalizeType(raw: string | undefined): FieldType {
  const t = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\(.*\)$/, "")
    .trim();
  if (!t) return "unknown";
  if (/^(uuid|uniqueidentifier)$/.test(t)) return "uuid";
  if (/^(bool|boolean|bit|tinyint\(1\))$/.test(t)) return "boolean";
  if (
    /^(int|integer|int2|int4|int8|bigint|smallint|serial|bigserial|smallserial|tinyint|mediumint|number|long|short|byte)$/.test(
      t,
    )
  )
    return "integer";
  if (/^(float|float4|float8|double|double precision|real)$/.test(t))
    return "float";
  if (/^(decimal|numeric|money|smallmoney|bigdecimal)$/.test(t))
    return "decimal";
  if (
    /^(timestamp|timestamptz|datetime|datetime2|datetimeoffset|timestamp with time zone|timestamp without time zone|date-time|instant)$/.test(
      t,
    )
  )
    return "datetime";
  if (/^(date|localdate)$/.test(t)) return "date";
  if (/^(time|timetz|time with time zone|time without time zone)$/.test(t))
    return "time";
  if (/^(json|jsonb|object|map|dict)$/.test(t)) return "json";
  if (
    /^(bytea|blob|binary|varbinary|bytes|longblob|mediumblob|tinyblob|image)$/.test(
      t,
    )
  )
    return "bytes";
  if (
    /^(text|longtext|mediumtext|tinytext|clob|ntext|citext|string\[\]|array|list|set|\w+\[\])$/.test(
      t,
    )
  ) {
    return t.endsWith("[]") || /array|list|set/.test(t) ? "array" : "text";
  }
  if (
    /^(varchar|nvarchar|char|nchar|character varying|character|string|str|text|enum|varchar2|nvarchar2)$/.test(
      t,
    )
  ) {
    return t === "enum" ? "enum" : "string";
  }
  if (/^(cuid|objectid|bigserial)$/.test(t)) return "string";
  return "unknown";
}
