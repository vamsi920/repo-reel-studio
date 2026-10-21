import { slugId, type Entity, type Field, type FieldType } from "../model";
import type { ParseResult } from "./types";

/**
 * JSON Schema and OpenAPI parser. An OpenAPI document contributes its
 * `components.schemas` (or Swagger 2 `definitions`); a plain JSON Schema
 * contributes its `definitions`/`$defs` plus the root object when it has
 * properties. Object-typed properties that `$ref` another schema become
 * foreign keys named `<prop>_id` when the target has an `id`, otherwise
 * they stay as JSON. Arrays of refs are back-references and are skipped.
 */

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function refName(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const m = ref.match(
    /[#/](?:components\/schemas|definitions|\$defs)\/([^/]+)$/,
  );
  return m ? m[1] : (ref.split("/").pop() ?? null);
}

function typeOf(schema: JsonObject): { type: FieldType; nullable: boolean } {
  let raw = schema.type;
  let nullable = schema.nullable === true;
  if (Array.isArray(raw)) {
    nullable = nullable || raw.includes("null");
    raw = raw.find((t) => t !== "null");
  }
  const format = typeof schema.format === "string" ? schema.format : "";
  if (schema.enum) return { type: "enum", nullable };
  switch (raw) {
    case "string":
      if (format === "uuid") return { type: "uuid", nullable };
      if (format === "date-time") return { type: "datetime", nullable };
      if (format === "date") return { type: "date", nullable };
      if (format === "time") return { type: "time", nullable };
      if (format === "binary" || format === "byte")
        return { type: "bytes", nullable };
      return {
        type:
          (schema.maxLength as number | undefined) &&
          (schema.maxLength as number) > 1000
            ? "text"
            : "string",
        nullable,
      };
    case "integer":
      return { type: "integer", nullable };
    case "number":
      return {
        type: format === "double" || format === "float" ? "float" : "decimal",
        nullable,
      };
    case "boolean":
      return { type: "boolean", nullable };
    case "array":
      return { type: "array", nullable };
    case "object":
      return { type: "json", nullable };
    default:
      if (schema.properties) return { type: "json", nullable };
      if (schema.oneOf || schema.anyOf) return { type: "unknown", nullable };
      return { type: "unknown", nullable };
  }
}

function semanticFromFormat(schema: JsonObject): Field["semantic"] | undefined {
  const format = typeof schema.format === "string" ? schema.format : "";
  switch (format) {
    case "email":
      return "email";
    case "uri":
    case "url":
      return "url";
    case "ipv4":
    case "ipv6":
      return "ip_address";
    case "hostname":
      return "url";
    case "password":
      return "password_hash";
    default:
      return undefined;
  }
}

function fieldsOf(
  schema: JsonObject,
  known: Set<string>,
  path: string,
  warnings: string[],
): Field[] {
  const props = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const fields: Field[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!isObject(raw)) continue;
    const ref = refName(raw.$ref);
    if (ref && known.has(ref)) {
      fields.push({
        name: /_id$|Id$/.test(name) ? name : `${name}_id`,
        type: "unknown",
        nullable: !required.has(name),
        references: { entity: slugId(ref), field: "id" },
        description:
          typeof raw.description === "string" ? raw.description : undefined,
      });
      continue;
    }
    const { type, nullable } = typeOf(raw);
    if (type === "array") {
      const items = isObject(raw.items) ? raw.items : {};
      if (refName(items.$ref)) continue; // back-reference (has-many)
      fields.push({
        name,
        type: "array",
        nullable: nullable || !required.has(name),
        items: typeOf(items).type,
      });
      continue;
    }
    const field: Field = {
      name,
      type,
      nullable: nullable || !required.has(name),
    };
    if (Array.isArray(raw.enum))
      field.enumValues = (raw.enum as unknown[])
        .filter((v) => v !== null)
        .map(String);
    if (typeof raw.minimum === "number") field.min = raw.minimum;
    if (typeof raw.maximum === "number") field.max = raw.maximum;
    if (typeof raw.exclusiveMinimum === "number")
      field.min = raw.exclusiveMinimum + (type === "integer" ? 1 : 0.01);
    if (typeof raw.exclusiveMaximum === "number")
      field.max = raw.exclusiveMaximum - (type === "integer" ? 1 : 0.01);
    if (typeof raw.maxLength === "number") field.maxLength = raw.maxLength;
    if (typeof raw.pattern === "string") field.pattern = raw.pattern;
    if (typeof raw.description === "string")
      field.description = raw.description;
    if (raw.default !== undefined) field.defaultValue = raw.default;
    if (raw.readOnly === true && name === "id") field.generated = true;
    const semantic = semanticFromFormat(raw);
    if (semantic) field.semantic = semantic;
    if (name === "id") {
      field.primaryKey = true;
      field.unique = true;
      field.nullable = false;
    }
    if (type === "unknown")
      warnings.push(`${path}: ${name} has no usable type`);
    fields.push(field);
  }
  return fields;
}

export function parseJsonSchema(
  text: string,
  path = "schema.json",
): ParseResult {
  const warnings: string[] = [];
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    // YAML OpenAPI files are common; a tiny subset is enough to fail clearly.
    return {
      entities: [],
      warnings: [
        `${path}: not valid JSON (YAML is not parsed; convert it or let the agent record the model)`,
      ],
      format: "json-schema",
    };
  }
  if (!isObject(doc))
    return {
      entities: [],
      warnings: [`${path}: not an object`],
      format: "json-schema",
    };
  const isOpenApi =
    typeof doc.openapi === "string" || typeof doc.swagger === "string";
  const defs: JsonObject =
    (isObject(doc.components) &&
    isObject((doc.components as JsonObject).schemas)
      ? ((doc.components as JsonObject).schemas as JsonObject)
      : null) ??
    (isObject(doc.definitions) ? (doc.definitions as JsonObject) : null) ??
    (isObject(doc.$defs) ? (doc.$defs as JsonObject) : null) ??
    {};
  const schemas: [string, JsonObject][] = Object.entries(defs).filter(
    (entry): entry is [string, JsonObject] => isObject(entry[1]),
  );
  if (!isOpenApi && isObject(doc.properties)) {
    const rootName =
      typeof doc.title === "string"
        ? doc.title
        : (path
            .replace(/\.[^.]+$/, "")
            .split("/")
            .pop() ?? "root");
    schemas.unshift([rootName, doc]);
  }
  const objectSchemas = schemas.filter(
    ([, s]) => isObject(s.properties) || Array.isArray(s.allOf),
  );
  const known = new Set(objectSchemas.map(([name]) => name));
  const entities: Entity[] = [];
  for (const [name, schema] of objectSchemas) {
    // allOf composition: merge the properties of inline members.
    let merged: JsonObject = schema;
    if (Array.isArray(schema.allOf)) {
      const props: JsonObject = {};
      const required: string[] = [];
      for (const part of schema.allOf as unknown[]) {
        if (!isObject(part)) continue;
        const ref = refName(part.$ref);
        const source =
          ref && isObject(defs[ref]) ? (defs[ref] as JsonObject) : part;
        if (isObject(source.properties))
          Object.assign(props, source.properties);
        if (Array.isArray(source.required))
          required.push(...(source.required as string[]));
      }
      if (isObject(schema.properties)) Object.assign(props, schema.properties);
      merged = {
        ...schema,
        properties: props,
        required: [
          ...required,
          ...((schema.required as string[] | undefined) ?? []),
        ],
      };
    }
    const fields = fieldsOf(merged, known, `${path}#${name}`, warnings);
    if (fields.length === 0) continue;
    entities.push({
      id: slugId(name),
      name,
      description:
        typeof merged.description === "string" ? merged.description : undefined,
      fields,
      evidence: [
        `${path}: ${isOpenApi ? "components.schemas" : "definitions"}.${name}`,
      ],
      source: isOpenApi ? "openapi" : "json-schema",
    });
  }
  if (entities.length === 0) warnings.push(`${path}: no object schemas found`);
  return { entities, warnings, format: isOpenApi ? "openapi" : "json-schema" };
}
