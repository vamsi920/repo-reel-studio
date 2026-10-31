/**
 * A tiny, dependency-free XML reader for JUnit and Cobertura files. Handles
 * elements, attributes, text, CDATA, comments and self-closing tags; ignores
 * namespaces, DTDs and processing instructions. Enough for test reports,
 * which runners generate from fixed templates; runs in the browser and in
 * Node tests alike (no DOMParser needed).
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? "");
  }
  return attrs;
}

/** Parses a document; returns the root element or null when malformed. */
export function parseXml(source: string): XmlNode | null {
  const root: XmlNode = {
    name: "#document",
    attrs: {},
    children: [],
    text: "",
  };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      stack[stack.length - 1].text += decodeEntities(source.slice(i));
      break;
    }
    if (lt > i)
      stack[stack.length - 1].text += decodeEntities(source.slice(i, lt));
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      if (end === -1) return null;
      i = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      if (end === -1) return null;
      stack[stack.length - 1].text += source.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (source.startsWith("<?", lt) || source.startsWith("<!", lt)) {
      const end = source.indexOf(">", lt);
      if (end === -1) return null;
      i = end + 1;
      continue;
    }
    const end = findTagEnd(source, lt);
    if (end === -1) return null;
    const body = source.slice(lt + 1, end);
    if (body.startsWith("/")) {
      const name = body.slice(1).trim().replace(/^.*:/, "");
      // Tolerate mismatched closes by popping to the nearest match.
      for (let s = stack.length - 1; s > 0; s -= 1) {
        if (stack[s].name === name) {
          stack.length = s;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    const selfClosing = body.endsWith("/");
    const content = selfClosing ? body.slice(0, -1) : body;
    const nameMatch = content.match(/^\s*([^\s/>]+)/);
    if (!nameMatch) return null;
    const node: XmlNode = {
      name: nameMatch[1].replace(/^.*:/, ""),
      attrs: parseAttrs(content.slice(nameMatch[0].length)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = end + 1;
  }
  return root.children[0] ?? null;
}

/** The index of the `>` closing a tag opened at `start`, quote-aware. */
function findTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

/** Every descendant (depth first) with the given element name. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const child of n.children) {
      if (child.name === name) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

export function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
