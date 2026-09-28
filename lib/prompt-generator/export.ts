/**
 * CSV / TXT export + CSV import helpers for the prompt generator.
 */

import type { PromptVariant } from "@/lib/prompt-generator/compile";

/** Tiny RFC-4180-ish CSV parser (quoted fields, "" escapes, CR/LF tolerant). */
export function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let i = 0;
  let inQuotes = false;
  const src = String(text || "");

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      record.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n") {
      record.push(field);
      rows.push(record);
      field = "";
      record = [];
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  const clean = rows.filter((r) => r.some((x) => String(x || "").trim() !== ""));
  if (clean.length === 0) return { headers: [], rows: [] };

  const headers = clean[0].map((h) => String(h || "").trim() || "col");
  const data = clean.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(r[idx] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows: data };
}

export interface CsvConcept extends Record<string, string> {
  subject: string;
}

export function conceptsFromCsv(text: string): CsvConcept[] {
  const { headers, rows } = parseCsv(text);
  const subjectKey =
    headers.find((h) => h.toLowerCase() === "subject") ||
    headers.find((h) => h.toLowerCase().includes("concept")) ||
    headers[0];
  return rows
    .map((r) => ({ ...r, subject: String(r[subjectKey] || "").trim() }))
    .filter((r): r is CsvConcept => Boolean(r.subject));
}

export function buildPromptCsv(items: Array<PromptVariant | { prompt: string; negativePrompt?: string }>): string {
  const headers = ["Prompt", "Negative Prompt"];
  const esc = (v: unknown) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = (items || []).map((it) => [
    esc(cleanPromptText(it.prompt)),
    esc(onePara(it.negativePrompt)),
  ]);
  return [headers.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function buildPromptTxt(items: Array<{ prompt: string }>): string {
  return (items || [])
    .map((it) => cleanPromptText(it.prompt))
    .filter(Boolean)
    .join("\n\n");
}

// One clean paragraph: strips leading labels like "Prompt:" / "**Prompt 01:**"
// and collapses all internal line breaks into single spaces.
export function cleanPromptText(s: unknown): string {
  let t = String(s || "").replace(/\*\*/g, "").trim();
  t = t.replace(/^\s*prompt\s*(#?\d+\s*[:\-–.)\]]?|\s*[:\-–]\s*)\s*/i, "");
  return onePara(t);
}

export function onePara(s: unknown): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function downloadText(content: string, filename: string, type = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
