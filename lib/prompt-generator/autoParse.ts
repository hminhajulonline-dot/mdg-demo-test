/**
 * Response-parsing helpers for the Auto Engine conversation loop -
 * port of CSV Tree's ToolAutoEngine.jsx text extraction utilities.
 */

import { cleanPromptText, onePara } from "@/lib/prompt-generator/export";

export function stripCodeBlocks(text: unknown): string {
  return String(text || "").replace(/```[\s\S]*?```/g, "").trim();
}

function cleanText(s: string): string {
  return String(s || "")
    .replace(/\*\*/g, "")
    .replace(/^\s*#{1,4}\s*/gm, "")
    .trim();
}

function stripNum(s: string): string {
  return String(s || "").replace(/^\d{1,3}[.)\-:\s]+/, "").trim();
}

// Numbered / bulleted list items → button options (e.g. "01. **Cute Ghost**").
export function extractListOptions(text: unknown): string[] {
  const out: string[] = [];
  const lines = String(text || "").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d{1,3}[.)\-:]|[-*•])\s*\*{0,2}\s*(.+?)\s*\*{0,2}\s*$/);
    if (m) {
      const label = stripNum(cleanText(m[1].replace(/\s*-\s*.*$/, "").trim()));
      if (label && label.length <= 60 && !/^(reply|type|note|example)/i.test(label)) out.push(label);
    }
    if (out.length >= 50) break;
  }
  return [...new Set(out)];
}

export interface ButtonsLine {
  body: string;
  options: string[];
  ready: boolean;
}

// Last "BUTTONS: a | b | c" (or BUTTONS: READY) line → options + body.
export function extractButtonsLine(text: unknown): ButtonsLine | null {
  const src = String(text || "");
  const m = src.match(/^BUTTONS:\s*(.*)\s*$/im);
  if (!m || m.index === undefined) return null;
  const body = src.slice(0, m.index).trim();
  const raw = m[1].trim();
  if (/^(done|ready)$/i.test(raw)) return { body, options: [], ready: true };
  const options = raw
    .split("|")
    .map((o) => stripNum(cleanText(o)))
    .filter(Boolean)
    .slice(0, 50);
  return { body, options, ready: false };
}

export interface MarkdownPrompt {
  prompt: string;
  negativePrompt: string;
  pro: boolean;
}

// Markdown prompt sections ("### Prompt 01 ... NegativePrompt: ...") → cards.
export function extractMarkdownPrompts(text: unknown): MarkdownPrompt[] {
  const src = String(text || "");
  const parts = src.split(/(?=^#{0,3}\s*\**\s*Prompt\s*\d+)/gim).filter((p) => p.trim());
  if (!parts.length) return [];
  const prompts: MarkdownPrompt[] = [];
  for (const part of parts) {
    if (!/^\s*#{0,3}\s*\**\s*Prompt\s*\d+/im.test(part)) continue;
    const negIdx = part.search(/Negative\s*Prompt/i);
    let prompt = part;
    let negativePrompt = "";
    if (negIdx > 0) {
      prompt = part.slice(0, negIdx);
      negativePrompt = part.slice(negIdx).replace(/^.*?:\s*/, "");
    }
    prompt = cleanPromptText(prompt.replace(/^\s*#{0,3}\s*\**\s*Prompt\s*\d+\**\s*:?\s*/im, ""));
    negativePrompt = onePara(negativePrompt);
    if (prompt.length > 20) prompts.push({ prompt, negativePrompt, pro: true });
    if (prompts.length >= 30) break;
  }
  return prompts;
}

// Single-prompt response (generation phase) → { prompt, negativePrompt }.
export function extractSinglePrompt(text: unknown): { prompt: string; negativePrompt: string } | null {
  const src = stripCodeBlocks(text);
  if (cleanText(src).length < 50) return null;
  const negIdx = src.search(/Negative\s*Prompt/i);
  if (negIdx > 0) {
    return {
      prompt: cleanPromptText(src.slice(0, negIdx)),
      negativePrompt: onePara(src.slice(negIdx).replace(/^.*?:\s*/, "")),
    };
  }
  return { prompt: cleanPromptText(src), negativePrompt: "" };
}
