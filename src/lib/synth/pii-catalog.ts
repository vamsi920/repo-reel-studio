import type { PiiClass, SemanticKind } from "./model";

/**
 * Every kind of personal data the studio recognises, with its privacy
 * class and whether a value that merely looks real is already a risk.
 *
 * Classes: `direct` identifies a person on its own; `quasi` does so in
 * combination (birth date + postcode + gender re-identify most people);
 * `sensitive` is special-category or secret data (health, biometrics,
 * beliefs, credentials, financial secrets) whose exposure harms on its own.
 *
 * Name rules are tried before the generic meaning rules, most specific
 * first, so `account_number` is a bank account (not a count) and
 * `card_expiry` is not a card number. Patterns use `(^|_)…($|_)` word
 * boundaries so they also match snake_cased descriptions ("customer social
 * security number" → `customer_social_security_number`).
 */

export interface PiiKind {
  semantic: SemanticKind;
  cls: PiiClass;
  /** Ask the user whether to keep, mask or redact (never decided silently). */
  highRisk: boolean;
  /** Column-name / snake_cased-description rule. */
  rule: RegExp;
}

export const PII_KINDS: readonly PiiKind[] = [
  // Credentials and secrets
  {
    semantic: "password_hash",
    cls: "sensitive",
    highRisk: false,
    rule: /password_?(hash|digest)|hashed_password|(^|_)(passwd|password|pwd)($|_)/i,
  },
  {
    semantic: "security_answer",
    cls: "sensitive",
    highRisk: true,
    rule: /security_?(question|answer)|secret_?(question|answer)|mother_?s?_?maiden|recovery_?answer/i,
  },
  {
    semantic: "card_cvv",
    cls: "sensitive",
    highRisk: true,
    rule: /(^|_)(cvv2?|cvc2?|cid|card_?(code|verification)|security_?code)($|_)/i,
  },
  {
    semantic: "pin",
    cls: "sensitive",
    highRisk: true,
    rule: /(^|_)(pin|pin_?number|atm_?pin|mpin)($|_)/i,
  },
  {
    semantic: "card_expiry",
    cls: "sensitive",
    highRisk: false,
    rule: /(card|cc)_?(exp|expiry|expiration)|(^|_)cc_?exp|(^|_)exp_?(mm|yy|month|year)($|_)/i,
  },
  // Financial identifiers
  {
    semantic: "card_number",
    cls: "direct",
    highRisk: true,
    rule: /card_?(number|num|no)|^pan$|credit_?card|debit_?card|(^|_)cc_?(num|number|no)?($|_)/i,
  },
  { semantic: "iban", cls: "direct", highRisk: true, rule: /(^|_)iban($|_)/i },
  {
    semantic: "routing_number",
    cls: "quasi",
    highRisk: false,
    rule: /(^|_)(routing(_number)?|aba|sort_?code|ifsc|bsb|transit_?number)($|_)/i,
  },
  {
    semantic: "swift_bic",
    cls: "none",
    highRisk: false,
    rule: /(^|_)(swift(_code)?|bic(_code)?)($|_)/i,
  },
  {
    semantic: "bank_account",
    cls: "direct",
    highRisk: true,
    rule: /(bank_?account|account_?(number|num|no)|acct_?(number|num|no)?($|_)|(^|_)acct($|_))/i,
  },
  {
    semantic: "credit_score",
    cls: "sensitive",
    highRisk: false,
    rule: /credit_?(score|rating)|(^|_)fico($|_)/i,
  },
  // Government identifiers
  {
    semantic: "ssn",
    cls: "direct",
    highRisk: true,
    rule: /(^|_)ssn($|_)|social_?security/i,
  },
  {
    semantic: "passport_number",
    cls: "direct",
    highRisk: true,
    rule: /passport/i,
  },
  {
    semantic: "license_plate",
    cls: "direct",
    highRisk: false,
    rule: /(license|licence|number|registration)_?plate|plate_?(number|no)|(^|_)reg_?(number|no)($|_)/i,
  },
  {
    semantic: "drivers_license",
    cls: "direct",
    highRisk: true,
    rule: /driver'?s?_?(licen[cs]e|permit)|(^|_)(dl|dln)_?(number|no|num)?($|_)|driving_?licen[cs]e/i,
  },
  {
    semantic: "tax_id",
    cls: "direct",
    highRisk: true,
    rule: /tax_?(id|number|no|code)|(^|_)(tin|itin|ein|vat_?(id|number|no)?|gstin|pan_?(number|card)|abn|utr|nif|siren|siret|steuer_?id)($|_)/i,
  },
  {
    semantic: "national_id",
    cls: "direct",
    highRisk: true,
    rule: /(^|_)(sin|nino|nin|aadhaar|aadhar|curp|cpf|rfc|nric|pesel|bsn|dni|nie|hkid|mykad|national_?(id|insurance|number)|personal_?(id|number|code)|citizen_?(id|number)|voter_?(id|number)|resident_?(id|card)|alien_?(number|registration)|uscis|green_?card|visa_?number|id_?card(_number)?|identity_?(number|card)|government_?id)($|_)/i,
  },
  // Health and special categories
  {
    semantic: "medical_record_number",
    cls: "direct",
    highRisk: true,
    rule: /(^|_)(mrn|medical_?record(_number)?|patient_?(id|number|no)|health_?(id|number|card)|nhs_?(number|no)|chart_?(number|no))($|_)/i,
  },
  {
    semantic: "insurance_number",
    cls: "direct",
    highRisk: true,
    rule: /insurance_?(id|number|no|member)|(^|_)(member_?id|policy_?(number|no)|medicare|medicaid|subscriber_?id|group_?number)($|_)/i,
  },
  {
    semantic: "blood_type",
    cls: "sensitive",
    highRisk: true,
    rule: /blood_?(type|group)/i,
  },
  {
    semantic: "health_condition",
    cls: "sensitive",
    highRisk: true,
    rule: /diagnos|(^|_)(conditions?|icd(_?10)?(_code)?|diseases?|illness(es)?|allerg(y|ies)|medications?|prescriptions?|symptoms?|treatments?|disabilit(y|ies)|vaccin\w*|pregnan\w*|mental_?health|therap(y|ies)|lab_?results?)($|_)/i,
  },
  {
    semantic: "biometric",
    cls: "sensitive",
    highRisk: true,
    rule: /biometric|fingerprint_?(template|data|image|scan)|face_?(id|template|encoding|embedding|scan)|(^|_)(retina|iris_?scan|voice_?print|dna|genetic|genome|palm_?print)($|_)|signature_?(image|data|blob)|(^|_)signature($|_)/i,
  },
  {
    semantic: "gender",
    cls: "quasi",
    highRisk: false,
    rule: /(^|_)(gender|sex|pronouns?)($|_)/i,
  },
  {
    semantic: "special_category",
    cls: "sensitive",
    highRisk: true,
    rule: /(^|_)(race|ethnicity|ethnic_?(group|origin)|religion|religious|faith|politic(al|s)?|party_?affiliation|sexual(ity)?|sexual_?orientation|orientation|union_?member(ship)?|caste|criminal(_record)?|conviction|arrests?|offen[cs]es?|immigration_?status|veteran_?status)($|_)/i,
  },
  // Online and device identifiers
  {
    semantic: "mac_address",
    cls: "direct",
    highRisk: false,
    rule: /mac_?addr(ess)?|(^|_)mac($|_)/i,
  },
  {
    semantic: "device_id",
    cls: "direct",
    highRisk: false,
    rule: /device_?(id|uuid|token|identifier)|(^|_)(imei|imsi|meid|udid|idfa|idfv|gaid|aaid|advertising_?id|ad_?id|android_?id|push_?token|serial_?(number|no))($|_)/i,
  },
  {
    semantic: "user_agent",
    cls: "quasi",
    highRisk: false,
    rule: /user_?agent|(^|_)ua($|_)/i,
  },
  {
    semantic: "ip_address",
    cls: "direct",
    highRisk: false,
    rule: /ip_?addr(ess)?|(^|_)ip(v[46])?($|_)|remote_?addr|client_?ip|x_?forwarded_?for/i,
  },
  {
    semantic: "social_profile",
    cls: "direct",
    highRisk: false,
    rule: /(linkedin|facebook|twitter|instagram|tiktok|github|social)_?(url|profile|handle|link|id)?($|_)|profile_?url/i,
  },
  // Vehicles, work, school
  {
    semantic: "vin",
    cls: "direct",
    highRisk: false,
    rule: /(^|_)vin($|_)|vehicle_?id(entification)?(_number)?|chassis_?(number|no)/i,
  },
  {
    semantic: "employee_id",
    cls: "quasi",
    highRisk: false,
    rule: /(employee|emp|staff|badge|personnel|worker|payroll)_?(id|number|no|num)/i,
  },
  {
    semantic: "student_id",
    cls: "quasi",
    highRisk: false,
    rule: /(student|pupil|learner|matriculation)_?(id|number|no)?($|_)/i,
  },
  // Life events and demographics
  {
    semantic: "date_of_death",
    cls: "quasi",
    highRisk: false,
    rule: /date_?of_?death|death_?date|deceased_?(at|on|date)|(^|_)dod($|_)/i,
  },
  {
    semantic: "birthdate",
    cls: "quasi",
    highRisk: false,
    rule: /birth|(^|_)dob($|_)/i,
  },
  {
    semantic: "marital_status",
    cls: "quasi",
    highRisk: false,
    rule: /marital|civil_?status|relationship_?status/i,
  },
  {
    semantic: "nationality",
    cls: "quasi",
    highRisk: false,
    rule: /nationality|citizenship|country_?of_?(birth|origin)|place_?of_?birth/i,
  },
  {
    semantic: "geolocation",
    cls: "quasi",
    highRisk: false,
    rule: /geo_?(location|point|hash|coordinates)|(^|_)(gps|coordinates?|lat_?lng|lat_?long|location_?point)($|_)/i,
  },
  // Contact details and names
  { semantic: "email", cls: "direct", highRisk: false, rule: /e_?mail/i },
  {
    semantic: "phone",
    cls: "direct",
    highRisk: false,
    rule: /phone|mobile|(^|_)(tel|telephone|fax|cell|whatsapp|sms_?number|contact_?number|msisdn)($|_)/i,
  },
  {
    semantic: "first_name",
    cls: "direct",
    highRisk: false,
    rule: /^(first|given|middle|second|fore)_?name$|(^|_)(first|given|middle)_?name($|_)/i,
  },
  {
    semantic: "last_name",
    cls: "direct",
    highRisk: false,
    rule: /^(last|family|sur|maiden)_?name$|(^|_)(last|family|maiden)_?name($|_)|(^|_)surname($|_)/i,
  },
  {
    semantic: "full_name",
    cls: "direct",
    highRisk: false,
    rule: /full_?name|display_?name|legal_?name|(^|_)(author|owner_?name|customer_?name|client_?name|contact_?name|recipient(_name)?|beneficiary(_name)?|patient_?name|employee_?name|card_?holder(_name)?|holder_?name|account_?holder|signatory|guardian(_name)?|emergency_?contact(_name)?|spouse(_name)?|next_?of_?kin|parent_?name|mother_?name|father_?name)($|_)|^user_name$/i,
  },
  {
    semantic: "username",
    cls: "direct",
    highRisk: false,
    rule: /^(user_?name|handle|login|login_?id|nick(name)?|screen_?name|alias)$/i,
  },
  {
    semantic: "street",
    cls: "direct",
    highRisk: false,
    rule: /street|address_?line|(^|_)address[12]?($|_)|(^|_)addr($|_)|(billing|shipping|home|mailing|postal|residential|work|delivery)_?address|residence|house_?(number|no)|apartment|(^|_)(apt|suite)($|_)/i,
  },
  {
    semantic: "postal_code",
    cls: "quasi",
    highRisk: false,
    rule: /zip|postal|post_?code|pin_?code|pincode|eircode/i,
  },
];

const BY_SEMANTIC = new Map(PII_KINDS.map((k) => [k.semantic, k]));

/** Meanings that identify someone but are generic data types, not rules above. */
const EXTRA_CLASSES: Partial<Record<SemanticKind, PiiClass>> = {
  token: "sensitive",
  age: "quasi",
  city: "quasi",
  state: "quasi",
  latitude: "quasi",
  longitude: "quasi",
  job_title: "quasi",
  company: "quasi",
  image_url: "quasi",
};

export function piiClassOfSemantic(semantic: SemanticKind): PiiClass {
  return BY_SEMANTIC.get(semantic)?.cls ?? EXTRA_CLASSES[semantic] ?? "none";
}

export function isHighRiskSemantic(semantic: SemanticKind): boolean {
  return BY_SEMANTIC.get(semantic)?.highRisk ?? false;
}

/** Column names for money that is personal (pay, wealth, debt). */
export const PERSONAL_MONEY =
  /salary|income|wage|compensation|pay_?rate|bonus|net_?worth|balance|debt|loan_?amount|mortgage|alimony|pension|benefits?_?amount/i;

/** Free-text meanings: a real export may hide personal data inside them. */
export const FREE_TEXT_SEMANTICS: readonly SemanticKind[] = [
  "description",
  "paragraph",
  "sentence",
  "title",
  "generic",
];

/** Entity names whose `name` / `title` column is a person, not a thing. */
export const PERSON_ENTITY =
  /(user|customer|client|person|people|member|employee|staff|patient|contact|author|student|owner|account|profile|applicant|candidate|guardian|driver|passenger|tenant|subscriber|buyer|seller|lead|beneficiar|holder|worker|teacher|doctor|physician|nurse|resident|citizen|voter|donor|guest|visitor)/i;
