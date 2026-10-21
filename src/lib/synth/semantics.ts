import type { Field, FieldType, PiiClass, SemanticKind } from "./model";

/**
 * Guess what a field means from its name and type. Order matters: the first
 * matching rule wins, and specific names (`billing_email`) come before the
 * generic ones (`email`). The agent can always override `semantic` with
 * what it read in the code.
 */
const NAME_RULES: [RegExp, SemanticKind][] = [
  [/^(id|pk|_id|uid)$/i, "id"],
  [/password_?(hash|digest)|hashed_password|passwd/i, "password_hash"],
  [/e_?mail/i, "email"],
  [/^(first|given)_?name$/i, "first_name"],
  [/^(last|family|sur)_?name$/i, "last_name"],
  [
    /(full_?name|display_?name|^name$|author|owner_name|customer_name|user_name$)/i,
    "full_name",
  ],
  [/^(user_?name|handle|login|nick(name)?|screen_?name)$/i, "username"],
  [/(phone|mobile|tel(ephone)?|fax)/i, "phone"],
  [/(avatar|image|photo|picture|thumbnail|logo)_?(url)?$/i, "image_url"],
  [/(url|link|href|website|homepage|endpoint)/i, "url"],
  [/(ip_?addr(ess)?$|(^|_)ip$|remote_addr)/i, "ip_address"],
  [/(uuid|guid)/i, "uuid"],
  [/slug|permalink/i, "slug"],
  [/(street|address_?line|address1|address$|addr)/i, "street"],
  [/(city|town)/i, "city"],
  [/(state|province|region)(_code|_name)?$/i, "state"],
  [/country_?code|iso_?country/i, "country_code"],
  [/country/i, "country"],
  [/(zip|postal|post_?code)/i, "postal_code"],
  [/(lat|latitude)$/i, "latitude"],
  [/(lng|lon|long|longitude)$/i, "longitude"],
  [/currency(_code)?$/i, "currency_code"],
  [/(price|unit_cost|cost|fee|rate_amount|msrp)/i, "price"],
  [
    /(amount|total|subtotal|balance|salary|revenue|budget|tax$|discount$)/i,
    "amount",
  ],
  [/(percent|pct|ratio|share)/i, "percentage"],
  [/(quantity|qty|units|stock|inventory)/i, "quantity"],
  [/(count|num_|number_of|_total$|views|likes|followers)/i, "count"],
  [/^age$/i, "age"],
  [/(birth|dob)/i, "birthdate"],
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
  [/(job|position|role_title|occupation)/i, "job_title"],
  [/(status|state$|stage|phase)/i, "status"],
  [/colou?r/i, "color"],
  [/(sku|part_number|product_code|barcode|upc|ean)/i, "sku"],
  [/iban/i, "iban"],
  [/(card_?number|pan$|credit_card)/i, "card_number"],
  [/(ssn|social_security|national_id|passport|aadhaar|nino)/i, "national_id"],
  [/(tax_?id|vat|ein|gstin)/i, "tax_id"],
  [/(token|secret|api_?key|session_id|refresh)/i, "token"],
  [/(locale|language|lang)$/i, "locale"],
  [/(timezone|tz)$/i, "timezone"],
  [/(mime|content_type)/i, "mime_type"],
  [/(file_?name|filename|attachment|path)/i, "file_name"],
  [/version/i, "version"],
  [/(sha|checksum|digest|fingerprint|etag|hash)/i, "hash"],
  [/(title|subject|headline|heading)/i, "title"],
  [
    /(description|summary|bio|about|notes?|comment|body|content|message|text)/i,
    "description",
  ],
  [
    /(is_|has_|can_|should_|enabled|active|verified|deleted$|published|archived|flag)/i,
    "boolean",
  ],
];

export function inferSemantic(name: string, type: FieldType): SemanticKind {
  if (type === "boolean") return "boolean";
  if (type === "uuid") return name === "id" ? "id" : "uuid";
  if (type === "json") return "json";
  for (const [pattern, kind] of NAME_RULES) {
    if (!pattern.test(name)) continue;
    // A date-named field that is numeric is a count, not a date, and so on:
    // the type wins over a name that does not fit it.
    if (
      (kind === "created_at" ||
        kind === "updated_at" ||
        kind === "deleted_at" ||
        kind === "date_past" ||
        kind === "date_future" ||
        kind === "birthdate") &&
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
    return kind;
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

const DIRECT: SemanticKind[] = [
  "email",
  "full_name",
  "first_name",
  "last_name",
  "username",
  "phone",
  "street",
  "national_id",
  "tax_id",
  "iban",
  "card_number",
  "ip_address",
];
const QUASI: SemanticKind[] = [
  "birthdate",
  "age",
  "postal_code",
  "city",
  "state",
  "latitude",
  "longitude",
  "job_title",
  "company",
  "image_url",
];
const SENSITIVE: SemanticKind[] = ["password_hash", "token", "amount", "price"];

/** Privacy class for a field: its explicit `pii`, else from its meaning. */
export function piiClassOf(field: Field): PiiClass {
  if (field.pii) return field.pii;
  const semantic = field.semantic ?? inferSemantic(field.name, field.type);
  if (DIRECT.includes(semantic)) return "direct";
  if (semantic === "password_hash" || semantic === "token") return "sensitive";
  if (QUASI.includes(semantic)) return "quasi";
  if (
    SENSITIVE.includes(semantic) &&
    /salary|income|balance/i.test(field.name)
  ) {
    return "sensitive";
  }
  if (
    /health|medical|diagnosis|religion|ethnic|gender|sexual|political/i.test(
      field.name,
    )
  ) {
    return "sensitive";
  }
  return "none";
}

/** Fill in `semantic` for every field that lacks one. Pure. */
export function withInferredSemantics<T extends { fields: Field[] }>(
  entity: T,
): T {
  return {
    ...entity,
    fields: entity.fields.map((f) =>
      f.semantic ? f : { ...f, semantic: inferSemantic(f.name, f.type) },
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
