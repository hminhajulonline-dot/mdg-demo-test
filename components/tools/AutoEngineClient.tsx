"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolToast, { type ToolToastData } from "@/components/tools/ToolToast";
import { runTextAi } from "@/lib/client/textAi";
import {
  buildPromptCsv,
  buildPromptTxt,
  downloadText,
} from "@/lib/prompt-generator/export";
import {
  extractButtonsLine,
  extractListOptions,
  extractMarkdownPrompts,
  extractSinglePrompt,
  stripCodeBlocks,
  type MarkdownPrompt,
} from "@/lib/prompt-generator/autoParse";

const AI_OPTS = { maxTokens: 4000, jsonMode: false } as const;

const I = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const SPINNER = (
  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ICONS = {
  sparkles:
    "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z",
  arrowLeft: "M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18",
  play: "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653Z",
  refresh:
    "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99",
  copy:
    "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75",
  check: "M4.5 12.75l6 6 9-13.5",
  fileDown:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 0 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 1 18 18a8.967 8.967 0 0 1-6 2.292m0-14.25v14.25",
  chevron: "m19.5 8.25-7.5 7.5-7.5-7.5",
  wand: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z",
};

interface MasterPrompt {
  id: string;
  title: string;
  description: string;
  systemPrompt: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  options?: string[];
  prompts?: MarkdownPrompt[];
  ready?: boolean;
  raw?: string;
  isError?: boolean;
  error?: string;
}

interface GenItem {
  ts: number;
  prompt: string;
  negativePrompt: string;
  processing: boolean;
  failed: boolean;
  pro?: boolean;
}

function cleanText(s: string): string {
  return String(s || "")
    .replace(/\*\*/g, "")
    .replace(/^\s*#{1,4}\s*/gm, "")
    .trim();
}

export default function AutoEngineClient() {
  const [masterPrompts, setMasterPrompts] = useState<MasterPrompt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<"qa" | "count">("qa");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [countNum, setCountNum] = useState("5");
  const [genItems, setGenItems] = useState<GenItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [toast, setToast] = useState<ToolToastData | null>(null);
  const failedHistoryRef = useRef<Msg[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string, kind: ToolToastData["kind"] = "success") => {
    setToast({ msg, kind });
  }, []);

  const selected = useMemo(
    () => masterPrompts.find((mp) => mp.id === selectedId),
    [masterPrompts, selectedId]
  );

  const qaPrompts = useMemo(() => {
    const out: MarkdownPrompt[] = [];
    messages.forEach((m) => {
      if (Array.isArray(m.prompts)) m.prompts.forEach((p) => out.push(p));
    });
    return out;
  }, [messages]);

  const allPrompts = useMemo(
    () => [...qaPrompts, ...genItems.filter((g) => !g.processing && g.prompt).map((g) => ({ prompt: g.prompt, negativePrompt: g.negativePrompt, pro: g.pro !== false }))],
    [qaPrompts, genItems]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/master-prompts");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load master prompts.");
        if (cancelled) return;
        const list: MasterPrompt[] = (json.prompts || []).map(
          (p: { id: string; title: string; description: string | null; system_prompt: string }) => ({
            id: p.id,
            title: p.title,
            description: p.description || "",
            systemPrompt: p.system_prompt,
          })
        );
        setMasterPrompts(list);
        setSelectedId((prev) => prev || (list.length ? list[0].id : ""));
      } catch (err) {
        if (!cancelled) showToast(err instanceof Error ? err.message : "Load failed.", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, genItems]);

  // --- Q&A step: questions only, buttons only, never Continue ----------------
  async function askAi(history: Msg[]): Promise<Msg> {
    if (!selected) throw new Error("Select a master prompt first.");
    const systemPrompt = selected.systemPrompt;
    const recent = history
      .slice(-6)
      .map(
        (m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content || "").slice(0, 1000)}`
      )
      .join("\n");
    const latestUser = [...history].reverse().find((m) => m.role === "user");
    const instruction = `${systemPrompt}

CONVERSATION SO FAR (recent only):
${recent || "(just started — begin with your opening step)"}

YOUR TASK: ask the NEXT question of the master prompt for the user's latest reply. NEVER repeat an earlier question. DO NOT generate final prompts yet.
${latestUser ? `The user's LATEST reply is: "${latestUser.content}".` : `This is the start. Give your opening step.`}

FORMAT — TWO parts (these FORMAT rules override any conflicting output-format rule in the master prompt above; CONTENT still follows the master prompt):
PART 1: your normal reply — questions and short confirmations ONLY, no final prompts.
PART 2: the LAST line must be exactly one of:
BUTTONS: choice 1 | choice 2 | choice 3
BUTTONS: READY
Rules: short labels, no numbering, max 12. Topic-list step → every topic as a button. When NO more questions remain: PART 1 = one-line summary of all user choices, PART 2 = BUTTONS: READY with nothing after it.`;
    const { text } = await runTextAi(instruction, {
      ...AI_OPTS,
      onStatus: setStatusMsg,
      onFallback: (from, to, reason) =>
        showToast(`Switched from ${from} to ${to} (${reason}).`, "warn"),
    });
    setStatusMsg("");
    const btn = extractButtonsLine(text);
    const body = btn ? btn.body : String(text || "");
    const prompts = extractMarkdownPrompts(body);
    const listOpts = extractListOptions(stripCodeBlocks(body)).slice(0, 50);
    const cleaned = cleanText(stripCodeBlocks(body)).slice(0, 3000);
    const options = btn ? btn.options : listOpts;
    if (!prompts.length && !cleaned && !options.length) {
      throw new Error("AI returned an empty response. Retry this step.");
    }
    return {
      role: "assistant",
      content:
        cleaned || (prompts.length ? `Generated ${prompts.length} prompt(s).` : "Please choose."),
      options,
      prompts,
      ready: btn ? btn.ready : false,
      raw: String(text || "").slice(0, 2000),
    };
  }

  function enterCountPhase(text: string) {
    setSummary(cleanText(stripCodeBlocks(text)).slice(0, 500) || (selected?.title ?? ""));
    setPhase("count");
  }

  async function handleStart() {
    if (!selected) {
      showToast("Select a master prompt first.", "error");
      return;
    }
    setStarted(true);
    setPhase("qa");
    setMessages([]);
    setGenItems([]);
    setDone(false);
    setSummary("");
    failedHistoryRef.current = null;
    setThinking(true);
    try {
      const reply = await askAi([]);
      setMessages([reply]);
      if (reply.ready || (reply.prompts?.length ?? 0) > 0) enterCountPhase(reply.content);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to start.", "error");
      setStarted(false);
    } finally {
      setThinking(false);
      setStatusMsg("");
    }
  }

  async function handlePick(option: string) {
    if (thinking || generating || phase !== "qa") return;
    const history = [...messages, { role: "user" as const, content: option }];
    setMessages(history);
    setThinking(true);
    try {
      const reply = await askAi(history);
      const repeated = history.some(
        (m) => m.role === "assistant" && m.content === reply.content
      );
      if (!reply.prompts?.length && !reply.ready && repeated) {
        throw new Error("AI is repeating itself. Press Restart and try again.");
      }
      failedHistoryRef.current = null;
      setMessages([...history, reply]);
      if (reply.prompts?.length) showToast(`${reply.prompts.length} prompt(s) generated!`);
      if (reply.ready || reply.prompts?.length) enterCountPhase(reply.content);
    } catch (err) {
      failedHistoryRef.current = history;
      setMessages([
        ...history,
        {
          role: "assistant",
          content: "",
          isError: true,
          error: err instanceof Error ? err.message : "Step failed.",
        },
      ]);
    } finally {
      setThinking(false);
      setStatusMsg("");
    }
  }

  async function handleRetryStep() {
    const history = failedHistoryRef.current;
    if (!history || thinking) return;
    const clean = history.filter((m) => !m.isError);
    setThinking(true);
    try {
      const reply = await askAi(clean);
      failedHistoryRef.current = null;
      setMessages([...clean, reply]);
      if (reply.prompts?.length) showToast(`${reply.prompts.length} prompt(s) generated!`);
      if (reply.ready || reply.prompts?.length) enterCountPhase(reply.content);
    } catch (err) {
      setMessages([
        ...clean,
        {
          role: "assistant",
          content: "",
          isError: true,
          error: err instanceof Error ? err.message : "Step failed.",
        },
      ]);
    } finally {
      setThinking(false);
      setStatusMsg("");
    }
  }

  function handleReset() {
    setStarted(false);
    setPhase("qa");
    setMessages([]);
    setGenItems([]);
    setDone(false);
    setSummary("");
    failedHistoryRef.current = null;
    setStatusMsg("");
  }

  function handleSkipToCount() {
    const last = [...messages].reverse().find((m) => m.role === "assistant" && !m.isError);
    enterCountPhase(last ? last.content : (selected?.title ?? ""));
  }

  // --- Generation: one-by-one like the manual engine ------------------------
  function priorPromptsText() {
    const all = [
      ...qaPrompts.map((p) => p.prompt),
      ...genItems
        .filter((g) => !g.processing && g.prompt)
        .map((g) => g.prompt),
    ];
    return all.map((p, i) => `${i + 1}. ${String(p).slice(0, 250)}`).join("\n");
  }

  async function generateOne(idx: number, total: number): Promise<GenItem> {
    if (!selected) throw new Error("Select a master prompt first.");
    const instruction = `${selected.systemPrompt}

CONTEXT (user's confirmed choices): ${summary}
TASK: Write prompt #${idx} of ${total} for this request. Follow the master prompt's length, format and quality rules EXACTLY — never shorten or summarize.
OUTPUT: ONLY the single prompt text${/negative/i.test(selected.systemPrompt) ? ' plus one "NegativePrompt:" line at the end' : ""}. No headings, no numbering, no commentary, no BUTTONS line.
DO NOT repeat any of these already-generated prompts:
${priorPromptsText() || "(none yet)"}`;
    const { text } = await runTextAi(instruction, {
      ...AI_OPTS,
      onStatus: setStatusMsg,
      onFallback: (from, to, reason) =>
        showToast(`Switched from ${from} to ${to} (${reason}).`, "warn"),
    });
    const parsed = extractSinglePrompt(text);
    if (!parsed || parsed.prompt.length < 50) throw new Error(`Prompt #${idx} came back too short.`);
    return {
      ts: 0,
      prompt: parsed.prompt,
      negativePrompt: parsed.negativePrompt,
      processing: false,
      failed: false,
      pro: true,
    };
  }

  async function handleGenerateCount() {
    const n = Math.max(1, Math.min(50, Number(countNum) || 5));
    if (!summary) {
      showToast("No topic context yet.", "error");
      return;
    }
    setGenerating(true);
    const placeholders: GenItem[] = Array.from({ length: n }, (_, i) => ({
      ts: Date.now() + i,
      prompt: "",
      negativePrompt: "",
      processing: true,
      failed: false,
      pro: true,
    }));
    setGenItems((prev) => [...placeholders, ...prev].slice(0, 200));
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const ts = placeholders[i].ts;
      try {
        const res = await generateOne(i + 1, n);
        setGenItems((prev) =>
          prev.map((g) => (g.ts === ts ? { ...g, ...res, ts, processing: false } : g))
        );
        ok++;
      } catch {
        setGenItems((prev) =>
          prev.map((g) => (g.ts === ts ? { ...g, processing: false, failed: true } : g))
        );
      }
    }
    setGenerating(false);
    setStatusMsg("");
    if (ok > 0) {
      setDone(true);
      showToast(`${ok} prompt(s) generated!`);
    } else {
      showToast("Generation failed. Try again.", "error");
    }
  }

  async function handleRetryOne(ts: number) {
    if (generating) return;
    setGenItems((prev) => prev.map((g) => (g.ts === ts ? { ...g, processing: true, failed: false } : g)));
    try {
      const total = genItems.filter((g) => !g.processing || g.ts === ts).length || 1;
      const res = await generateOne(1, total);
      setGenItems((prev) => prev.map((g) => (g.ts === ts ? { ...g, ...res, ts, processing: false } : g)));
      setDone(true);
    } catch {
      setGenItems((prev) => prev.map((g) => (g.ts === ts ? { ...g, processing: false, failed: true } : g)));
      showToast("Retry failed.", "error");
    } finally {
      setStatusMsg("");
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    showToast("Copied!");
  }

  function handleExportTxt() {
    if (!allPrompts.length) {
      showToast("No prompts yet.", "warn");
      return;
    }
    downloadText(buildPromptTxt(allPrompts), "auto-engine-prompts.txt", "text/plain;charset=utf-8;");
    showToast("Downloaded TXT!");
  }

  function handleExportCsv() {
    if (!allPrompts.length) {
      showToast("No prompts yet.", "warn");
      return;
    }
    downloadText(buildPromptCsv(allPrompts), "auto-engine-prompts.csv", "text/csv;charset=utf-8;");
    showToast("Downloaded CSV!");
  }

  function handleCopyAll() {
    if (!allPrompts.length) {
      showToast("No prompts yet.", "warn");
      return;
    }
    navigator.clipboard.writeText(allPrompts.map((p) => p.prompt).join("\n\n"));
    showToast("All prompts copied!");
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastIsLatest =
    lastAssistant && messages.length > 0 && messages[messages.length - 1] === lastAssistant;
  const effectiveOptions =
    lastAssistant &&
    !lastAssistant.isError &&
    (!Array.isArray(lastAssistant.options) || !lastAssistant.options.length)
      ? ["__skip__"]
      : lastAssistant?.options || [];
  const showOptions =
    started &&
    phase === "qa" &&
    !thinking &&
    !lastAssistant?.isError &&
    lastIsLatest &&
    effectiveOptions.length > 0;
  const showRetry =
    started && phase === "qa" && !thinking && lastAssistant?.isError && lastIsLatest;
  const showSkip =
    started &&
    phase === "qa" &&
    !thinking &&
    !generating &&
    messages.filter((m) => m.role === "user").length >= 1 &&
    !lastAssistant?.isError;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/tools"
        className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
      >
        <I d={ICONS.arrowLeft} className="h-3.5 w-3.5" /> All tools
      </Link>

      <header className="mb-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg">
          <I d={ICONS.sparkles} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold md:text-3xl">AI Microstock Prompt Generator</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Guided mode — pick a master prompt, press Start, answer questions with buttons, enter a
            count, and get full-length production-ready prompts one by one.
          </p>
        </div>
      </header>

      {/* Engine tabs */}
      <div className="mb-5 flex items-center gap-2">
        <Link
          href="/tools/prompt-generator"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-300"
        >
          <I d={ICONS.wand} className="h-3 w-3" /> Manual Engine
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[11px] font-bold text-white shadow-sm">
          <I d={ICONS.sparkles} className="h-3 w-3" /> Auto Engine
        </span>
      </div>

      {/* Master prompt picker + Start */}
      <section className="mb-5 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-800">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Master Prompt
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={
                thinking || generating || (started && phase !== "qa") || !masterPrompts.length
              }
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/50"
            >
              <I d={ICONS.sparkles} className="h-3 w-3 shrink-0 text-brand" />
              <span className="flex-1 truncate">
                {selected ? selected.title : "No master prompts yet"}
              </span>
              <I
                d={ICONS.chevron}
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
              />
            </button>
            {pickerOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-surface py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {masterPrompts.map((mp) => (
                    <button
                      key={mp.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(mp.id);
                        handleReset();
                        setPickerOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 text-left transition-colors ${
                        mp.id === selectedId
                          ? "bg-brand/10"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <span
                        className={`block text-xs font-bold ${mp.id === selectedId ? "text-brand" : ""}`}
                      >
                        {mp.title}
                      </span>
                      {mp.description ? (
                        <span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {mp.description}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          {!started ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={!selected || thinking}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-6 py-2.5 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {thinking ? SPINNER : <I d={ICONS.play} className="h-3.5 w-3.5" />} Start
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              disabled={thinking || generating}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-6 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:border-brand disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <I d={ICONS.refresh} className="h-3 w-3" /> Restart
            </button>
          )}
        </div>
        {selected?.description ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {selected.description}
          </p>
        ) : null}
        {statusMsg ? (
          <p className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-brand">
            {SPINNER} {statusMsg}
          </p>
        ) : null}
      </section>

      {/* Conversation */}
      {started ? (
        <section className="mb-5 space-y-3">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[12px] font-semibold text-white">
                  {m.content}
                </div>
              </div>
            ) : m.isError ? (
              <div
                key={i}
                className="rounded-2xl rounded-bl-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/10"
              >
                <p className="text-[12px] font-bold text-red-600 dark:text-red-400">
                  Step failed: {m.error}
                </p>
              </div>
            ) : (
              <div key={i} className="space-y-3">
                <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-surface px-4 py-3 dark:border-slate-800">
                  <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700 dark:text-slate-200">
                    {m.content}
                  </div>
                  {m.raw ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[9px] text-slate-400 hover:text-slate-600">
                        Debug: raw AI response
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[9px] text-slate-500 dark:bg-slate-900/50">
                        {m.raw}
                      </pre>
                    </details>
                  ) : null}
                </div>
                {m.prompts?.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {m.prompts.map((p, pi) => (
                      <div
                        key={pi}
                        className="rounded-xl border border-slate-200 bg-surface p-3 dark:border-slate-800"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                            Prompt {pi + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(p.prompt, `auto-${i}-${pi}`)}
                            className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-brand hover:underline"
                          >
                            <I
                              d={copiedId === `auto-${i}-${pi}` ? ICONS.check : ICONS.copy}
                              className="h-3 w-3"
                            />{" "}
                            Copy
                          </button>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                          {p.prompt}
                        </p>
                        {p.negativePrompt ? (
                          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
                            Negative: {p.negativePrompt}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          )}
          {thinking ? (
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-surface px-4 py-3 dark:border-slate-800">
              {SPINNER}
              <span className="text-[11px] font-bold text-slate-500">AI thinking…</span>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </section>
      ) : null}

      {/* Option buttons — questions only, never Continue */}
      {showOptions ? (
        <section className="mb-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Choose one
          </p>
          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto p-1">
            {effectiveOptions
              .filter((o) => o !== "__skip__")
              .map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePick(opt)}
                  className="rounded-xl border border-slate-200 bg-surface px-3.5 py-2 text-[11px] font-bold text-slate-700 transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand dark:border-slate-700 dark:text-slate-200 dark:hover:bg-brand/10"
                >
                  {opt}
                </button>
              ))}
          </div>
          {showSkip ? (
            <button
              type="button"
              onClick={handleSkipToCount}
              className="mt-2 text-[10px] font-bold text-slate-400 hover:text-brand hover:underline"
            >
              Skip questions — enter prompt count →
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Retry failed step */}
      {showRetry ? (
        <section className="mb-5">
          <button
            type="button"
            onClick={handleRetryStep}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-[11px] font-bold text-white transition-colors hover:bg-amber-600"
          >
            <I d={ICONS.refresh} className="h-3 w-3" /> Retry this step
          </button>
        </section>
      ) : null}

      {/* Count box */}
      {started && phase === "count" ? (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-800">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            How many prompts do you need?
          </p>
          {summary ? (
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {summary}
            </p>
          ) : null}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              min={1}
              max={50}
              placeholder="10"
              value={countNum}
              onChange={(e) => setCountNum(e.target.value)}
              disabled={generating}
              className="w-full rounded-xl border-2 border-slate-300 bg-surface px-4 py-2.5 text-center text-sm font-extrabold text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50 sm:w-28 dark:border-slate-600 dark:text-white"
            />
            <button
              type="button"
              onClick={handleGenerateCount}
              disabled={generating || thinking}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-6 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {generating ? SPINNER : <I d={ICONS.play} className="h-3.5 w-3.5" />}
              Generate
            </button>
          </div>
          {generating && statusMsg ? (
            <p className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-brand">
              {SPINNER} {statusMsg}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Generated prompts one-by-one */}
      {genItems.length > 0 ? (
        <section className="mb-5">
          <div className="grid gap-3 md:grid-cols-2">
            {genItems.map((g) => (
              <div
                key={g.ts}
                className="rounded-xl border border-slate-200 bg-surface p-3 dark:border-slate-800"
              >
                {g.processing ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    <span className="text-[10px] font-bold text-brand">Generating…</span>
                  </div>
                ) : g.failed ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <p className="text-[10px] font-bold text-red-500">Failed to generate.</p>
                    <button
                      type="button"
                      onClick={() => handleRetryOne(g.ts)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-amber-600"
                    >
                      <I d={ICONS.refresh} className="h-2.5 w-2.5" /> Retry
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                        Prompt
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(g.prompt, `gen-${g.ts}`)}
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-brand hover:underline"
                      >
                        <I
                          d={copiedId === `gen-${g.ts}` ? ICONS.check : ICONS.copy}
                          className="h-3 w-3"
                        />{" "}
                        Copy
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                      {g.prompt}
                    </p>
                    {g.negativePrompt ? (
                      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
                        Negative: {g.negativePrompt}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
                        AI polished
                      </span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Export */}
      {allPrompts.length > 0 ? (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-800">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            {done
              ? `Done — ${allPrompts.length} prompt(s)`
              : `${allPrompts.length} prompt(s) so far`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-brand transition-colors hover:bg-brand/5 dark:border-slate-700"
            >
              <I d={ICONS.copy} className="h-3 w-3" /> Copy All
            </button>
            <button
              type="button"
              onClick={handleExportTxt}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              <I d={ICONS.fileDown} className="h-3 w-3" /> TXT
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              <I d={ICONS.fileDown} className="h-3 w-3" /> CSV
            </button>
          </div>
        </section>
      ) : null}

      {!started ? (
        <section className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <I d={ICONS.book} className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-slate-600" />
          <p className="mx-auto max-w-md text-[11px] leading-relaxed text-slate-400">
            Select a master prompt above and press <b>Start</b>. The AI asks questions — answer with
            the buttons. When the questions are done, a count box appears — enter a number and press{" "}
            <b>Generate</b>, and full-length prompts arrive one by one.
          </p>
        </section>
      ) : null}

      <ToolToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
