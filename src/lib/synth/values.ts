import type { Field, SemanticKind } from "./model";
import { uuidFrom, type Rng } from "./rng";

/**
 * Value generators per semantic kind. Deterministic given the rng, so the
 * same seed always yields the same dataset. Word lists are deliberately
 * compact: realism comes from structure (consistent names in emails,
 * plausible ranges, correlated cities and countries), not from huge lists.
 */

export const FIRST_NAMES = [
  "Olivia",
  "Liam",
  "Emma",
  "Noah",
  "Amelia",
  "Oliver",
  "Sophia",
  "Elijah",
  "Isabella",
  "Lucas",
  "Mia",
  "Mateo",
  "Charlotte",
  "Levi",
  "Ava",
  "Ezra",
  "Luna",
  "Asher",
  "Harper",
  "Leo",
  "Aiko",
  "Kenji",
  "Priya",
  "Arjun",
  "Fatima",
  "Omar",
  "Zainab",
  "Yusuf",
  "Chioma",
  "Kwame",
  "Ingrid",
  "Sven",
  "Mateusz",
  "Agnieszka",
  "Giulia",
  "Marco",
  "Camille",
  "Louis",
  "Lucía",
  "Diego",
  "Beatriz",
  "João",
  "Hana",
  "Minjun",
  "Mei",
  "Wei",
  "Anya",
  "Dmitri",
  "Elif",
  "Emre",
  "Sofia",
  "Nikolai",
  "Maya",
  "Idris",
  "Nora",
  "Tomás",
  "Freya",
  "Finn",
  "Rosa",
  "Jonas",
];

export const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Tanaka",
  "Sato",
  "Suzuki",
  "Patel",
  "Sharma",
  "Khan",
  "Ahmed",
  "Hassan",
  "Okafor",
  "Mensah",
  "Larsen",
  "Nilsson",
  "Kowalski",
  "Nowak",
  "Rossi",
  "Russo",
  "Dubois",
  "Moreau",
  "Fernández",
  "Silva",
  "Santos",
  "Kim",
  "Park",
  "Chen",
  "Wang",
  "Ivanova",
  "Petrov",
  "Yilmaz",
  "Demir",
  "Novák",
  "Berg",
  "Haddad",
  "Mendes",
  "Costa",
  "Nakamura",
  "O'Brien",
  "Walsh",
  "Müller",
  "Schneider",
  "Fischer",
];

export const COMPANY_WORDS = [
  "Acme",
  "Northwind",
  "Globex",
  "Initech",
  "Umbrella",
  "Vandelay",
  "Hooli",
  "Stark",
  "Wayne",
  "Wonka",
  "Aperture",
  "Tyrell",
  "Cyberdyne",
  "Soylent",
  "Massive",
  "Dunder",
  "Pied",
  "Sirius",
  "Oceanic",
  "Monarch",
  "Kestrel",
  "Lumen",
  "Vertex",
  "Harbor",
  "Meridian",
  "Atlas",
  "Summit",
  "Beacon",
  "Cobalt",
  "Juniper",
];
export const COMPANY_SUFFIXES = [
  "Inc",
  "LLC",
  "Ltd",
  "GmbH",
  "Corp",
  "Co",
  "Group",
  "Labs",
  "Systems",
  "Partners",
  "Holdings",
  "Studio",
];

export const CITIES: [string, string, string, string][] = [
  // city, state/region, country, ISO code
  ["New York", "NY", "United States", "US"],
  ["San Francisco", "CA", "United States", "US"],
  ["Austin", "TX", "United States", "US"],
  ["Chicago", "IL", "United States", "US"],
  ["Seattle", "WA", "United States", "US"],
  ["Toronto", "ON", "Canada", "CA"],
  ["Vancouver", "BC", "Canada", "CA"],
  ["London", "England", "United Kingdom", "GB"],
  ["Manchester", "England", "United Kingdom", "GB"],
  ["Dublin", "Leinster", "Ireland", "IE"],
  ["Berlin", "Berlin", "Germany", "DE"],
  ["Munich", "Bavaria", "Germany", "DE"],
  ["Paris", "Île-de-France", "France", "FR"],
  ["Lyon", "Auvergne-Rhône-Alpes", "France", "FR"],
  ["Madrid", "Madrid", "Spain", "ES"],
  ["Barcelona", "Catalonia", "Spain", "ES"],
  ["Lisbon", "Lisbon", "Portugal", "PT"],
  ["Rome", "Lazio", "Italy", "IT"],
  ["Milan", "Lombardy", "Italy", "IT"],
  ["Amsterdam", "North Holland", "Netherlands", "NL"],
  ["Stockholm", "Stockholm", "Sweden", "SE"],
  ["Oslo", "Oslo", "Norway", "NO"],
  ["Warsaw", "Masovia", "Poland", "PL"],
  ["Kyiv", "Kyiv", "Ukraine", "UA"],
  ["Istanbul", "Istanbul", "Türkiye", "TR"],
  ["Dubai", "Dubai", "United Arab Emirates", "AE"],
  ["Cairo", "Cairo", "Egypt", "EG"],
  ["Lagos", "Lagos", "Nigeria", "NG"],
  ["Nairobi", "Nairobi", "Kenya", "KE"],
  ["Mumbai", "Maharashtra", "India", "IN"],
  ["Bengaluru", "Karnataka", "India", "IN"],
  ["Hyderabad", "Telangana", "India", "IN"],
  ["Singapore", "Singapore", "Singapore", "SG"],
  ["Tokyo", "Tokyo", "Japan", "JP"],
  ["Osaka", "Osaka", "Japan", "JP"],
  ["Seoul", "Seoul", "South Korea", "KR"],
  ["Shanghai", "Shanghai", "China", "CN"],
  ["Taipei", "Taipei", "Taiwan", "TW"],
  ["Sydney", "NSW", "Australia", "AU"],
  ["Melbourne", "VIC", "Australia", "AU"],
  ["Auckland", "Auckland", "New Zealand", "NZ"],
  ["São Paulo", "SP", "Brazil", "BR"],
  ["Buenos Aires", "CABA", "Argentina", "AR"],
  ["Mexico City", "CDMX", "Mexico", "MX"],
  ["Bogotá", "Bogotá", "Colombia", "CO"],
];

export const STREETS = [
  "Main St",
  "Oak Ave",
  "Maple Dr",
  "Cedar Ln",
  "Park Rd",
  "High St",
  "Station Rd",
  "Church St",
  "Market St",
  "King St",
  "Queen St",
  "Elm St",
  "Lake View",
  "Hill Rd",
  "River Rd",
  "Mill Ln",
  "Bridge St",
  "Harbor Way",
  "Sunset Blvd",
  "Union Sq",
];

export const JOB_TITLES = [
  "Software Engineer",
  "Product Manager",
  "Data Analyst",
  "Designer",
  "Account Executive",
  "Customer Success Manager",
  "Operations Lead",
  "Finance Controller",
  "Marketing Manager",
  "QA Engineer",
  "DevOps Engineer",
  "Solutions Architect",
  "Support Specialist",
  "Recruiter",
  "Legal Counsel",
  "Nurse",
  "Teacher",
  "Pharmacist",
  "Electrician",
  "Chef",
];

export const WORDS = [
  "alpha",
  "beacon",
  "cedar",
  "delta",
  "ember",
  "falcon",
  "granite",
  "harbor",
  "indigo",
  "juniper",
  "kestrel",
  "lumen",
  "meadow",
  "nimbus",
  "orchid",
  "prairie",
  "quartz",
  "ridge",
  "summit",
  "tundra",
  "umber",
  "vertex",
  "willow",
  "xenon",
  "yarrow",
  "zephyr",
  "anchor",
  "bramble",
  "canyon",
  "dusk",
  "echo",
  "fjord",
  "glacier",
  "heron",
  "isle",
  "jade",
  "kelp",
  "lagoon",
  "marble",
  "nectar",
  "oasis",
  "pebble",
  "quill",
  "reef",
  "saffron",
  "thistle",
  "upland",
  "valley",
  "wren",
  "yonder",
];

export const PRODUCT_ADJECTIVES = [
  "Compact",
  "Classic",
  "Premium",
  "Essential",
  "Smart",
  "Ultra",
  "Eco",
  "Pro",
  "Lite",
  "Deluxe",
  "Rustic",
  "Modern",
  "Wireless",
  "Organic",
  "Portable",
];
export const PRODUCT_NOUNS = [
  "Notebook",
  "Backpack",
  "Lamp",
  "Headphones",
  "Kettle",
  "Chair",
  "Bottle",
  "Keyboard",
  "Jacket",
  "Planter",
  "Speaker",
  "Blanket",
  "Mug",
  "Watch",
  "Sneakers",
  "Candle",
  "Charger",
  "Tent",
  "Scarf",
  "Router",
];

export const COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "black",
  "white",
  "gray",
  "teal",
  "navy",
  "maroon",
  "olive",
  "pink",
  "brown",
];
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "INR",
  "CAD",
  "AUD",
  "BRL",
  "CHF",
  "SGD",
];
export const LOCALES = [
  "en-US",
  "en-GB",
  "de-DE",
  "fr-FR",
  "es-ES",
  "pt-BR",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "it-IT",
  "nl-NL",
  "tr-TR",
  "uk-UA",
  "ar-EG",
];
export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "America/Sao_Paulo",
];
export const MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "video/mp4",
  "audio/mpeg",
  "application/zip",
];
export const FILE_EXTENSIONS = [
  "png",
  "jpg",
  "pdf",
  "txt",
  "csv",
  "json",
  "mp4",
  "mp3",
  "zip",
  "docx",
];
export const STATUSES = ["active", "pending", "inactive", "archived"];
/** RFC 5737 documentation networks (first three octets). */
export const DOCUMENTATION_NETS = ["192.0.2", "198.51.100", "203.0.113"];

/** Published card-network test numbers (Luhn-valid, never chargeable). */
export const TEST_CARD_NUMBERS = [
  "4111111111111111",
  "4012888888881881",
  "4242424242424242",
  "5555555555554444",
  "5105105105105100",
  "378282246310005",
  "6011111111111117",
];

export const EMAIL_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "mail.example",
  "test.example",
];

/**
 * Edge-case strings that break naive code: multilingual, RTL, emoji,
 * combining marks, zero-width, SQL/HTML-looking, whitespace. All safe to
 * store; none is an injection when parameters are bound.
 */
export const EDGE_STRINGS = [
  "Zoë Ångström-Ñúñez",
  "李小龍",
  "محمد العربي",
  "Ünïcödé Tëst",
  "😀 emoji name 🚀",
  'O\'Connor "quoted"',
  "<b>not html</b>",
  "Robert'); DROP TABLE students;--",
  "  leading and trailing  ",
  "line\nbreak",
  "tab\tseparated",
  "zero​width",
  "a",
  "",
];

/** A person, kept consistent across first/last/full/email/username. */
export interface Persona {
  first: string;
  last: string;
  full: string;
  username: string;
  email: string;
}

export function personaFrom(rng: Rng, index: number): Persona {
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  const ascii = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  const username = `${ascii(first)}.${ascii(last)}${index > 0 ? index : ""}`;
  return {
    first,
    last,
    full: `${first} ${last}`,
    username,
    email: `${username}@${rng.pick(EMAIL_DOMAINS)}`,
  };
}

export interface Place {
  street: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

export function placeFrom(rng: Rng): Place {
  const [city, state, country, countryCode] = rng.pick(CITIES);
  return {
    street: `${rng.int(1, 9999)} ${rng.pick(STREETS)}`,
    city,
    state,
    country,
    countryCode,
    postalCode:
      countryCode === "US"
        ? String(rng.int(10000, 99999))
        : countryCode === "GB"
          ? `${rng.pick(["SW", "E", "N", "W", "SE"])}${rng.int(1, 20)} ${rng.int(1, 9)}${rng.pick(["AA", "BD", "XY", "QR"])}`
          : String(rng.int(1000, 99999)),
    latitude: Number(rng.float(-60, 70).toFixed(5)),
    longitude: Number(rng.float(-150, 150).toFixed(5)),
  };
}

const DAY_MS = 86_400_000;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sentence(rng: Rng, words = 8): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) parts.push(rng.pick(WORDS));
  const text = parts.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function paragraph(rng: Rng, sentences = 3): string {
  const parts: string[] = [];
  for (let i = 0; i < sentences; i++) parts.push(sentence(rng, rng.int(6, 14)));
  return parts.join(" ");
}

export function hexString(rng: Rng, length: number): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i++) out += hex[rng.int(0, 15)];
  return out;
}

export function base62(rng: Rng, length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[rng.int(0, chars.length - 1)];
  return out;
}

/** Context shared by the fields of one row so values agree with each other. */
export interface RowContext {
  rng: Rng;
  index: number;
  persona: Persona;
  place: Place;
  /** Reference "now" for dates, fixed per run for reproducibility. */
  now: Date;
  createdAt?: Date;
}

function clampNumber(
  value: number,
  field: Field,
  fallbackMin: number,
  fallbackMax: number,
): number {
  const min = field.min ?? fallbackMin;
  const max = field.max ?? fallbackMax;
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, field: Field, defaultScale: number): number {
  const scale = field.scale ?? defaultScale;
  return Number(value.toFixed(scale));
}

/** A value for `field` given its semantic kind and the row context. */
export function valueFor(
  field: Field,
  semantic: SemanticKind,
  ctx: RowContext,
): unknown {
  const { rng, persona, place, now } = ctx;
  const numeric =
    field.type === "integer" ||
    field.type === "float" ||
    field.type === "decimal";
  const integer = field.type === "integer";
  const dateish = field.type === "date" || field.type === "datetime";
  const asDate = (d: Date) =>
    field.type === "date" ? isoDate(d) : d.toISOString();

  // Distributions recorded from a profile beat the generic generators.
  const dist = field.distribution;
  if (dist?.kind === "categorical" && Object.keys(dist.weights).length) {
    const keys = Object.keys(dist.weights);
    const picked = rng.weighted(
      keys,
      keys.map((k) => dist.weights[k]),
    );
    return numeric ? Number(picked) : picked;
  }
  if (dist?.kind === "normal" && numeric) {
    const v = clampNumber(
      rng.normal(dist.mean, dist.stddev),
      field,
      -1e12,
      1e12,
    );
    return integer ? Math.round(v) : roundTo(v, field, 2);
  }
  if (dist?.kind === "uniform" && numeric) {
    const v = rng.float(dist.min, dist.max);
    return integer ? Math.round(v) : roundTo(v, field, 2);
  }

  if (field.enumValues?.length) return rng.pick(field.enumValues);

  // Example values the user gave for the column beat a guessed meaning.
  if (field.examples?.length) {
    const picked = rng.pick(field.examples);
    if (numeric) {
      const n = Number(picked);
      if (Number.isFinite(n)) return integer ? Math.round(n) : n;
    } else {
      return picked;
    }
  }

  switch (semantic) {
    case "id":
    case "uuid":
      return field.type === "integer" ? ctx.index + 1 : uuidFrom(rng);
    case "email":
      return persona.email;
    case "first_name":
      return persona.first;
    case "last_name":
      return persona.last;
    case "full_name":
      return persona.full;
    case "username":
      return persona.username;
    case "password_hash":
      return `$2b$12$${base62(rng, 53)}`;
    case "phone":
      // NANP reserves 555-0100..0199 for fiction: never a real line.
      return `+1${rng.int(201, 989)}555${rng.int(100, 199).toString().padStart(4, "0")}`;
    case "url":
      return `https://${rng.pick(WORDS)}.example.com/${rng.pick(WORDS)}`;
    case "image_url":
      return `https://images.example.com/${hexString(rng, 12)}.jpg`;
    case "ip_address":
      // RFC 5737 documentation ranges: never routed, never a real host.
      return `${rng.pick(DOCUMENTATION_NETS)}.${rng.int(1, 254)}`;
    case "slug":
      return `${rng.pick(WORDS)}-${rng.pick(WORDS)}-${ctx.index + 1}`;
    case "title":
      return `${rng.pick(PRODUCT_ADJECTIVES)} ${rng.pick(PRODUCT_NOUNS)}`;
    case "description":
      return sentence(rng, rng.int(8, 16));
    case "paragraph":
      return paragraph(rng, rng.int(2, 4));
    case "sentence":
      return sentence(rng);
    case "word":
      return rng.pick(WORDS);
    case "company":
      return `${rng.pick(COMPANY_WORDS)} ${rng.pick(COMPANY_SUFFIXES)}`;
    case "job_title":
      return rng.pick(JOB_TITLES);
    case "street":
      return place.street;
    case "city":
      return place.city;
    case "state":
      return place.state;
    case "country":
      return place.country;
    case "country_code":
      return place.countryCode;
    case "postal_code":
      return place.postalCode;
    case "latitude":
      return place.latitude;
    case "longitude":
      return place.longitude;
    case "currency_code":
      return rng.pick(CURRENCIES);
    case "price": {
      const v = clampNumber(Math.exp(rng.normal(3.2, 1.0)), field, 0.5, 5000);
      return integer ? Math.round(v) : roundTo(v, field, 2);
    }
    case "amount": {
      const v = clampNumber(Math.exp(rng.normal(4.5, 1.4)), field, 0, 100000);
      return integer ? Math.round(v) : roundTo(v, field, 2);
    }
    case "percentage": {
      const v = clampNumber(rng.float(0, 100), field, 0, 100);
      return integer ? Math.round(v) : roundTo(v, field, 2);
    }
    case "quantity":
      return Math.round(
        clampNumber(
          1 + Math.floor(Math.exp(rng.normal(0.8, 0.9))),
          field,
          0,
          10000,
        ),
      );
    case "count":
      return Math.round(
        clampNumber(
          Math.floor(Math.exp(rng.normal(2, 1.5))),
          field,
          0,
          1_000_000,
        ),
      );
    case "age":
      return Math.round(clampNumber(rng.normal(38, 13), field, 18, 90));
    case "year":
      return Math.round(
        clampNumber(rng.int(1990, now.getUTCFullYear()), field, 1900, 2100),
      );
    case "created_at": {
      const d =
        ctx.createdAt ??
        new Date(now.getTime() - rng.int(0, 730) * DAY_MS - rng.int(0, DAY_MS));
      return dateish ? asDate(d) : d.toISOString();
    }
    case "updated_at": {
      const base = ctx.createdAt ?? new Date(now.getTime() - 400 * DAY_MS);
      const d = new Date(
        base.getTime() +
          rng.int(0, Math.max(1, now.getTime() - base.getTime())),
      );
      return dateish ? asDate(d) : d.toISOString();
    }
    case "deleted_at":
      return null;
    case "date_past": {
      const d = new Date(
        now.getTime() - rng.int(0, 1095) * DAY_MS - rng.int(0, DAY_MS),
      );
      if (field.type === "time") return d.toISOString().slice(11, 19);
      return dateish ? asDate(d) : d.toISOString();
    }
    case "date_future": {
      const d = new Date(
        now.getTime() + rng.int(1, 365) * DAY_MS + rng.int(0, DAY_MS),
      );
      return dateish ? asDate(d) : d.toISOString();
    }
    case "birthdate": {
      const d = new Date(now.getTime() - rng.int(18 * 365, 85 * 365) * DAY_MS);
      return isoDate(d);
    }
    case "boolean":
      return rng.chance(0.7);
    case "status":
      return rng.weighted(STATUSES, [6, 2, 1, 1]);
    case "color":
      return rng.pick(COLORS);
    case "sku":
      return `${rng.pick(["SKU", "PRD", "ITM"])}-${rng.int(1000, 9999)}-${base62(rng, 3).toUpperCase()}`;
    case "iban":
      // "TEST" is not a bank code, so the account cannot exist.
      return `GB${rng.int(10, 99)}TEST${String(rng.int(0, 999999)).padStart(6, "0")}${String(rng.int(0, 99999999)).padStart(8, "0")}`;
    case "card_number":
      // Card networks' published test numbers: they pass Luhn checks and
      // can never be charged.
      return rng.pick(TEST_CARD_NUMBERS);
    case "tax_id":
      // EIN prefix 00 is never assigned.
      return `00-${String(rng.int(0, 9999999)).padStart(7, "0")}`;
    case "ssn":
      // Area 9xx with group 00 is never issued as an SSN (nor an ITIN), so
      // a synthetic SSN cannot be someone's real one.
      return `9${String(rng.int(0, 99)).padStart(2, "0")}-00-${String(rng.int(0, 9999)).padStart(4, "0")}`;
    case "national_id":
      return `TEST-${rng.int(100000000, 999999999)}`;
    case "token":
      return `tok_test_${base62(rng, 24)}`;
    case "locale":
      return rng.pick(LOCALES);
    case "timezone":
      return rng.pick(TIMEZONES);
    case "mime_type":
      return rng.pick(MIME_TYPES);
    case "file_name":
      return `${rng.pick(WORDS)}-${rng.int(1, 999)}.${rng.pick(FILE_EXTENSIONS)}`;
    case "version":
      return `${rng.int(0, 9)}.${rng.int(0, 20)}.${rng.int(0, 50)}`;
    case "hash":
      return hexString(rng, 40);
    case "json":
      return { key: rng.pick(WORDS), value: rng.int(0, 100) };
    case "generic":
    default:
      break;
  }

  // Nothing semantic matched: fall back to the physical type.
  switch (field.type) {
    case "integer":
      return rng.int(field.min ?? 0, field.max ?? 1000);
    case "float":
    case "decimal":
      return roundTo(rng.float(field.min ?? 0, field.max ?? 1000), field, 2);
    case "boolean":
      return rng.chance(0.5);
    case "date":
      return isoDate(new Date(now.getTime() - rng.int(0, 1000) * DAY_MS));
    case "datetime":
      return new Date(now.getTime() - rng.int(0, 1000) * DAY_MS).toISOString();
    case "time":
      return `${String(rng.int(0, 23)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}:00`;
    case "uuid":
      return uuidFrom(rng);
    case "json":
      return { key: rng.pick(WORDS) };
    case "bytes":
      return hexString(rng, 16);
    case "array":
      return [rng.pick(WORDS), rng.pick(WORDS)];
    case "text":
      return paragraph(rng, 2);
    default:
      return variedLengthText(rng, field.maxLength);
  }
}

/**
 * Text for a column whose meaning is unknown. With a declared length the
 * lengths spread across the whole range (a varchar(10) gets 1..10
 * characters, not always two words), which is what real data looks like
 * and what breaks naive code.
 */
function variedLengthText(rng: Rng, maxLength: number | undefined): string {
  if (!maxLength || maxLength > 64)
    return `${rng.pick(WORDS)} ${rng.pick(WORDS)}`;
  const target = rng.int(1, maxLength);
  let text = "";
  while (text.length < target) text += `${text ? " " : ""}${rng.pick(WORDS)}`;
  return text.slice(0, target).trimEnd() || text.slice(0, 1);
}

/** Boundary / malformed-but-valid values for an edge-case row. */
export function edgeValueFor(
  field: Field,
  semantic: SemanticKind,
  ctx: RowContext,
  variant: number,
): unknown {
  const { rng } = ctx;
  if (field.nullable && variant % 4 === 3) return null;
  if (field.enumValues?.length) {
    return field.enumValues[variant % field.enumValues.length];
  }
  switch (field.type) {
    case "string":
    case "text": {
      if (semantic === "email") {
        return [
          "very.long.local-part+tag@sub.example.com",
          "ünicode@exämple.com",
          "a@b.co",
          `${"x".repeat(60)}@example.com`,
        ][variant % 4];
      }
      if (semantic === "url" || semantic === "image_url") {
        return [
          "https://example.com/?q=a%20b&x=1#frag",
          "http://localhost:3000/path",
          `https://example.com/${"p/".repeat(40)}`,
          "https://xn--80ak6aa92e.com/",
        ][variant % 4];
      }
      const max = field.maxLength ?? (field.type === "text" ? 2000 : 255);
      const edge = EDGE_STRINGS[variant % EDGE_STRINGS.length];
      if (variant % 3 === 0) return "x".repeat(Math.max(1, max));
      if (edge === "" && !field.nullable && field.unique) return "-";
      return edge.length > max ? edge.slice(0, max) : edge;
    }
    case "integer": {
      const min =
        field.min ??
        (semantic === "count" || semantic === "quantity" || semantic === "age"
          ? 0
          : -2147483648);
      const max = field.max ?? 2147483647;
      return [min, max, 0, min === 0 ? 1 : -1][variant % 4];
    }
    case "float":
    case "decimal": {
      const min = field.min ?? 0;
      const max = field.max ?? 999999.99;
      return [min, max, 0.01, Number((max / 3).toFixed(field.scale ?? 2))][
        variant % 4
      ];
    }
    case "boolean":
      return variant % 2 === 0;
    case "date":
      return ["1970-01-01", "2024-02-29", "2099-12-31", "2000-01-01"][
        variant % 4
      ];
    case "datetime":
      return [
        "1970-01-01T00:00:00.000Z",
        "2024-02-29T23:59:59.999Z",
        "2099-12-31T23:59:59.000Z",
        "2026-03-29T01:30:00.000Z",
      ][variant % 4];
    case "time":
      return ["00:00:00", "23:59:59", "12:00:00", "01:30:00"][variant % 4];
    case "json":
      return [{}, { nested: { deep: [1, 2, 3] } }, [], { unicode: "日本語" }][
        variant % 4
      ];
    case "array":
      return [
        [],
        ["one"],
        Array.from({ length: 50 }, (_, i) => `item-${i}`),
        [""],
      ][variant % 4];
    default:
      return valueFor(field, semantic, {
        ...ctx,
        rng: rng.fork(`edge-${variant}`),
      });
  }
}
