import type { Rng } from "./rng";

/**
 * Values from a field's regex, for the small regex dialect that formats in
 * requirement documents turn into (`LN-\d{4}-\d{5}`, `[A-Z]{3}\d{4}`,
 * `(0[1-9]|1[0-2])`). Anything outside it (lookarounds, backreferences)
 * returns null and the caller falls back to its normal generator.
 */

type Node =
  | { kind: "chars"; chars: string }
  | { kind: "alt"; options: Node[][] }
  | { kind: "repeat"; node: Node; min: number; max: number };

const DIGITS = "0123456789";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const WORD = `${UPPER}${LOWER}${DIGITS}_`;

class Unsupported extends Error {}

function parseClass(src: string, start: number): [string, number] {
  let i = start;
  let negate = false;
  if (src[i] === "^") {
    negate = true;
    i += 1;
  }
  let chars = "";
  while (i < src.length && src[i] !== "]") {
    let c = src[i];
    if (c === "\\") {
      const e = src[i + 1];
      i += 2;
      if (e === "d") chars += DIGITS;
      else if (e === "w") chars += WORD;
      else if (e === "s") chars += " ";
      else chars += e;
      continue;
    }
    if (src[i + 1] === "-" && src[i + 2] && src[i + 2] !== "]") {
      const from = c.charCodeAt(0);
      const to = src[i + 2].charCodeAt(0);
      if (to < from || to - from > 200) throw new Unsupported();
      for (let code = from; code <= to; code += 1) {
        chars += String.fromCharCode(code);
      }
      i += 3;
      continue;
    }
    c = src[i];
    chars += c;
    i += 1;
  }
  if (src[i] !== "]") throw new Unsupported();
  if (negate) {
    const pool = `${WORD} -`;
    chars = [...pool].filter((ch) => !chars.includes(ch)).join("");
  }
  if (!chars) throw new Unsupported();
  return [chars, i + 1];
}

function parseSequence(src: string, start: number): [Node[][], number] {
  const options: Node[][] = [[]];
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === ")") break;
    if (c === "|") {
      options.push([]);
      i += 1;
      continue;
    }
    let node: Node;
    if (c === "(") {
      let j = i + 1;
      if (src.startsWith("?:", j)) j += 2;
      else if (src[j] === "?") throw new Unsupported();
      const [inner, end] = parseSequence(src, j);
      if (src[end] !== ")") throw new Unsupported();
      node = { kind: "alt", options: inner };
      i = end + 1;
    } else if (c === "[") {
      const [chars, end] = parseClass(src, i + 1);
      node = { kind: "chars", chars };
      i = end;
    } else if (c === "\\") {
      const e = src[i + 1];
      if (e === undefined || /[1-9bBkpP]/.test(e)) throw new Unsupported();
      node = {
        kind: "chars",
        chars: e === "d" ? DIGITS : e === "w" ? WORD : e === "s" ? " " : e,
      };
      i += 2;
    } else if (c === ".") {
      node = { kind: "chars", chars: `${UPPER}${DIGITS}` };
      i += 1;
    } else if (c === "^" || c === "$") {
      i += 1;
      continue;
    } else if ("*+?{".includes(c)) {
      throw new Unsupported();
    } else {
      node = { kind: "chars", chars: c };
      i += 1;
    }
    // Quantifier.
    const q = src[i];
    if (q === "?" || q === "*" || q === "+") {
      node = {
        kind: "repeat",
        node,
        min: q === "+" ? 1 : 0,
        max: q === "?" ? 1 : 3,
      };
      i += 1;
    } else if (q === "{") {
      const m = /^\{(\d+)(?:,(\d*))?\}/.exec(src.slice(i));
      if (!m) throw new Unsupported();
      const min = Number(m[1]);
      const max =
        m[2] === undefined ? min : m[2] === "" ? min + 3 : Number(m[2]);
      if (max < min || max > 64) throw new Unsupported();
      node = { kind: "repeat", node, min, max };
      i += m[0].length;
    }
    options[options.length - 1].push(node);
  }
  return [options, i];
}

function emit(node: Node, rng: Rng): string {
  switch (node.kind) {
    case "chars":
      return node.chars[rng.int(0, node.chars.length - 1)];
    case "alt":
      return rng
        .pick(node.options)
        .map((n) => emit(n, rng))
        .join("");
    case "repeat": {
      const n = rng.int(node.min, node.max);
      let out = "";
      for (let k = 0; k < n; k += 1) out += emit(node.node, rng);
      return out;
    }
    default:
      return "";
  }
}

/** A value matching `pattern`, or null when the pattern is outside the dialect. */
export function valueFromPattern(pattern: string, rng: Rng): string | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return null;
  }
  try {
    const [options, end] = parseSequence(pattern, 0);
    if (end !== pattern.length) return null;
    const root: Node = { kind: "alt", options };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const value = emit(root, rng);
      if (re.test(value)) return value;
    }
    return null;
  } catch {
    return null;
  }
}

const DATE_PARTS: Record<string, string> = {
  YYYY: "(19|20)\\d{2}",
  YY: "\\d{2}",
  MM: "(0[1-9]|1[0-2])",
  DD: "(0[1-9]|[12]\\d|3[01])",
};

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * A format mask as business documents write it ("LN-YYYY-#####",
 * "AAA-9999", "XXX-XX-XXXX") as an anchored regex. `#`, `9`, `0` and `N`
 * runs are digits, `A` runs are letters, `X` runs are digits when the field
 * holds a number-like identifier and letters-or-digits otherwise; YYYY,
 * MM and DD are date parts; any other run of letters is literal.
 */
export function formatMaskToPattern(
  mask: string,
  { numericX = false }: { numericX?: boolean } = {},
): string | null {
  const text = mask.trim();
  if (text.length < 2 || text.length > 40) return null;
  if (!/[#9XAN0Y]/.test(text)) return null;
  let out = "";
  let i = 0;
  let placeholders = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const part = ["YYYY", "MM", "DD", "YY"].find((p) => rest.startsWith(p));
    if (part && !/[A-Z]/.test(text[i + part.length] ?? "")) {
      out += DATE_PARTS[part];
      i += part.length;
      placeholders += 1;
      continue;
    }
    const c = text[i];
    let j = i;
    while (j < text.length && text[j] === c) j += 1;
    const run = j - i;
    const word = /^[A-Za-z]+/.exec(rest)?.[0] ?? "";
    const quant = run > 1 ? `{${run}}` : "";
    if ("#90N".includes(c) && (c !== "N" || word.length === run)) {
      out += `\\d${quant}`;
      placeholders += 1;
    } else if (c === "A" && word.length === run) {
      out += `[A-Z]${quant}`;
      placeholders += 1;
    } else if (c === "X" && word.length === run) {
      out += `${numericX ? "\\d" : "[A-Z0-9]"}${quant}`;
      placeholders += 1;
    } else if (/[A-Za-z]/.test(c)) {
      // A literal prefix such as "LN" or "INV".
      out += escapeLiteral(word);
      i += word.length;
      continue;
    } else {
      out += escapeLiteral(text.slice(i, j));
    }
    i = j;
  }
  return placeholders ? `^${out}$` : null;
}
