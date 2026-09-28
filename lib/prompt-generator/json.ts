/**
 * Tolerant JSON salvage for AI responses - models love code fences,
 * smart quotes and prose even when told "STRICT JSON only".
 * Port of CSV Tree's parseJsonStrict() helpers.
 */

function cleanQuotes(s: string): string {
  const out: string[] = [];
  let m: { op: string; cl: string } | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (m) {
      if (ch === "\\") {
        out.push(ch);
        const nx = s[i + 1];
        if (nx === "\n") {
          out.push("\\n");
          i++;
        } else if (nx !== undefined) {
          out.push(nx);
          i++;
        }
        continue;
      }
      if (ch === "\n") {
        out.push("\\n");
        continue;
      }
      if (ch === "\r" || ch === "\t") {
        out.push(" ");
        continue;
      }
      if (ch === m.cl) {
        out.push('"');
        m = null;
        continue;
      }
      if (ch === '"' || ch === "\u201C" || ch === "\u201D") {
        out.push('\\"');
        continue;
      }
      if (ch === "'" || ch === "\u2018" || ch === "\u2019") {
        if (m.op === "'" || m.op === "\u2018") {
          out.push("\\'");
          continue;
        }
        out.push(ch);
        continue;
      }
      out.push(ch);
      continue;
    }
    if (ch === '"' || ch === "\u201C") {
      m = { op: ch, cl: ch === "\u201C" ? "\u201D" : '"' };
      out.push('"');
      continue;
    }
    if (ch === "'" || ch === "\u2018") {
      m = { op: ch, cl: ch === "\u2018" ? "\u2019" : "'" };
      out.push('"');
      continue;
    }
    if (ch === "\u201D" || ch === "\u2019") {
      m = { op: ch, cl: ch };
      out.push('"');
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

function extractBlock(s: string): string | null {
  const isQ = (c: string) =>
    c === '"' || c === "'" || c === "\u201C" || c === "\u201D" || c === "\u2018" || c === "\u2019";
  const attempt = (open: string, close: string): { block: string; start: number } | null => {
    const start = s.indexOf(open);
    if (start === -1) return null;
    let depth = 0;
    let quote: string | null = null;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (isQ(ch)) {
        quote = ch;
        continue;
      }
      if (ch === open) {
        depth++;
        continue;
      }
      if (ch === close) {
        depth--;
        if (depth === 0) return { block: s.slice(start, i + 1), start };
      }
    }
    return null;
  };
  const a = attempt("{", "}");
  const b = attempt("[", "]");
  if (a && (!b || a.start <= b.start)) return a.block;
  return b ? b.block : null;
}

function repairJson(raw: string): string {
  let cleaned = cleanQuotes(raw);
  cleaned = cleaned
    .replace(/([,{[]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
  return cleaned;
}

function buildJsonCandidates(raw: string): string[] {
  const stripFences = (s: string) =>
    s
      .replace(/```(?:json|javascript|js|text|plain)?\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
  const normalizeSmart = (s: string) =>
    s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  const r = String(raw ?? "");
  const cleaned = stripFences(r);
  const blockRaw = extractBlock(r);
  const blockCleaned = extractBlock(cleaned);
  const list: string[] = [];
  const push = (v: string) => {
    const t = String(v || "").trim();
    if (t && !list.some((x) => x === t)) list.push(t);
  };
  push(cleaned);
  if (blockRaw) push(blockRaw);
  if (blockCleaned && blockCleaned !== blockRaw) push(blockCleaned);
  push(repairJson(cleaned));
  if (blockRaw) push(repairJson(blockRaw));
  push(normalizeSmart(cleaned));
  if (blockRaw) push(normalizeSmart(blockRaw));
  return list;
}

export function parseJsonStrict(text: unknown): unknown {
  if (typeof text === "object" && text !== null) return text;
  for (const c of buildJsonCandidates(String(text ?? ""))) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next candidate
    }
  }
  throw new Error("AI returned invalid JSON.");
}

/** Shape returned by the describe/keyword JSON prompts. */
export interface DescribeImageJson {
  description?: string;
  subject?: string;
  keywords?: unknown;
}

export interface IpAuditJson {
  safe?: boolean;
  risks?: unknown;
  note?: string;
}

export interface PromptJson {
  prompt?: string;
  negativePrompt?: string;
}

export interface PromptsJson {
  prompts?: Array<{ prompt?: string; negativePrompt?: string }>;
}

export function asDescribeImage(v: unknown): DescribeImageJson {
  return (typeof v === "object" && v !== null ? v : {}) as DescribeImageJson;
}
