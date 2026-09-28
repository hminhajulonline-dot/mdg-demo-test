"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ToolToast, { type ToolToastData } from "@/components/tools/ToolToast";
import { prepareImage } from "@/lib/client/image";
import {
  ASPECT_RATIOS,
  IMAGE_TYPES,
  ICON_LAYOUTS,
  ICON_MODES,
  RASTER_TYPES,
  SIZE_PRESETS,
  VECTOR_COLOR_COUNTS,
  VECTOR_COLOR_FORMATS,
  VECTOR_TYPES,
} from "@/lib/prompt-generator/constants";
import {
  buildVariants,
  compileMicrostockPrompt,
  findIpRisks,
  sizeLabel,
  type PromptFormState,
} from "@/lib/prompt-generator/compile";
import {
  conceptsFromCsv,
  buildPromptCsv,
  buildPromptTxt,
  downloadText,
} from "@/lib/prompt-generator/export";
import {
  describeReferenceImage,
  ipAuditWithAi,
  polishOneWithAi,
  researchKeywordsWithAi,
} from "@/lib/prompt-generator/service";

const SAMPLE_KEYWORD_SETS = [
  "minimalist desk setup, warm morning light",
  "aerial drone view of a tropical coastline, turquoise water",
  "flat lay workspace with coffee and notebook, top light",
  "abstract flowing silk fabric, soft studio lighting",
  "cozy autumn forest trail, golden hour",
  "focused barista pouring latte art, warm cafe light",
  "jogger on a bridge at dawn, fog, city skyline",
  "stacked smooth river stones, balanced bokeh background",
];

interface RefImage {
  url: string;
  name: string;
  base64: string;
  mimeType: string;
}

interface OutputItem {
  ts: number;
  variant: number;
  subject?: string;
  imageType?: string;
  rasterType?: string;
  vectorType?: string;
  size?: string;
  ratio?: string;
  prompt: string;
  negativePrompt?: string;
  pro: boolean;
  processing?: boolean;
  provider?: string;
}

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
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z",
  shield:
    "M12 3l7.5 3v5.25c0 4.5-3.15 8.4-7.5 9.75-4.35-1.35-7.5-5.25-7.5-9.75V6L12 3Zm-3 8.25 2.25 2.25L15.75 9",
  copy:
    "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75",
  check: "M4.5 12.75l6 6 9-13.5",
  trash:
    "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.31 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  upload: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
  x: "M6 18L18 6M6 6l12 12",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  fileDown:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  fileText:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  plus: "M12 4.5v15m7.5-7.5h-15",
  refresh:
    "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99",
  image:
    "M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 12h.008v.008H18V12Zm-15 3.75V16.5A2.25 2.25 0 0 0 5.25 18.75h13.5A2.25 2.25 0 0 0 21 16.5v-1.5m-18 0V6A2.25 2.25 0 0 1 5.25 3.75h13.5A2.25 2.25 0 0 1 21 6v9.75m-18 0h18",
  layers: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  ruler:
    "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m7.5-3 1-3",
  arrowLeft: "M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18",
  imagePlus:
    "M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z",
};

function makeDefaultState(): PromptFormState {
  return {
    keywords: "",
    description: "",
    referenceNote: "",
    negativeWords: "",
    imageType: "raster",
    rasterType: "background",
    vectorColorFormat: "color",
    vectorType: "icon",
    iconMode: "single",
    iconLayout: "row",
    iconColCount: 4,
    iconCount: 4,
    vectorColorCount: 2,
    traceFriendly: true,
    sizeId: SIZE_PRESETS.find((p) => p.kind === "raster")?.id || "raster-2k",
    customW: "",
    customH: "",
    ratio: "1:1",
    ipCheck: true,
    minChars: "1500",
    maxChars: "2200",
    count: 3,
  };
}

function Card({
  title,
  icon,
  subtitle,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon ? <span className="shrink-0 text-brand">{icon}</span> : null}
          <div>
            <h2 className="text-sm font-bold leading-tight">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Num({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  suffix,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label} {suffix ? <span className="font-semibold normal-case text-slate-400">{suffix}</span> : null}
      </label>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:font-normal placeholder:text-slate-400 focus:border-brand focus:outline-none transition-colors"
      />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:font-normal placeholder:text-slate-400 focus:border-brand focus:outline-none transition-colors"
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  note,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  note?: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-brand"
      />
      <span>
        {label}
        {note ? <span className="mt-0.5 block text-[10px] font-semibold normal-case text-slate-400">{note}</span> : null}
      </span>
    </label>
  );
}

export default function PromptGeneratorClient() {
  const [s, setS] = useState<PromptFormState>(makeDefaultState);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkCopied, setBulkCopied] = useState(false);

  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [ipAi, setIpAi] = useState<{ safe: boolean; risks: string[]; note: string } | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [toast, setToast] = useState<ToolToastData | null>(null);

  const refInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, kind: ToolToastData["kind"] = "success") =>
    setToast({ msg, kind });

  const upd = (k: keyof PromptFormState, v: unknown) =>
    setS((prev) => ({ ...prev, [k]: v }) as PromptFormState);
  const setStr = (k: keyof PromptFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    upd(k, e.target.value);

  const subjectText = useMemo(
    () => [s.keywords, s.description, s.referenceNote].find((x) => String(x || "").trim()),
    [s.keywords, s.description, s.referenceNote],
  );

  const ipRisks = useMemo(
    () => findIpRisks(`${s.keywords} ${s.description} ${s.referenceNote}`),
    [s.keywords, s.description, s.referenceNote],
  );

  const busy = aiBusy !== null;
  const presetList = SIZE_PRESETS.filter((p) => p.kind === s.imageType);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      e.preventDefault();
      generate();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setShowDocs(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onEsc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, aiBusy]);

  function selectImageType(t: string) {
    const preset = SIZE_PRESETS.find((p) => p.kind === t);
    upd("imageType", t);
    if (preset) upd("sizeId", preset.id);
  }

  function clampNum(v: string | number | undefined, dflt: number, min: number, max: number) {
    const n = parseInt(String(v), 10);
    if (Number.isNaN(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }

  const count = clampNum(s.count, 3, 1, 100);

  const fb = (f: { from: string; to: string; reason: string }) => {
    if (f.from !== f.to) showToast(`Falling back from ${f.from} to ${f.to} (${f.reason})`, "warn");
  };
  const onStatus = (m: string) => setStatusMsg(m);

  async function doResearch() {
    const kw = String(s.keywords || "").trim();
    if (!kw) {
      showToast("Type keywords first.", "error");
      return;
    }
    setAiBusy("keywords");
    setStatusMsg(null);
    try {
      const r = await researchKeywordsWithAi(kw, { onFallback: fb, onStatus });
      if (!String(s.description || "").trim() && r.description) upd("description", r.description);
      if (Array.isArray(r.keywords) && r.keywords.length) upd("keywords", r.keywords.join(", "));
      showToast("Keywords researched.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Research failed.", "error");
    } finally {
      setAiBusy(null);
      setStatusMsg(null);
    }
  }

  async function handleRefFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const loaded: RefImage[] = [];
    for (const file of Array.from(files)) {
      try {
        const prepped = await prepareImage(file);
        loaded.push({
          url: URL.createObjectURL(file),
          name: file.name,
          base64: prepped.base64,
          mimeType: prepped.mimeType,
        });
      } catch {
        showToast(`Could not read ${file.name}`, "error");
      }
    }
    if (loaded.length) setRefImages((prev) => [...prev, ...loaded]);
    if (loaded.length) showToast(`${loaded.length} image(s) loaded.`);
    if (refInput.current) refInput.current.value = "";
  }

  function removeRefImage(idx: number) {
    setRefImages((prev) => {
      URL.revokeObjectURL(prev[idx]?.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function clearAllRefs() {
    refImages.forEach((r) => URL.revokeObjectURL(r.url));
    setRefImages([]);
    if (s.referenceNote) upd("referenceNote", "");
  }

  async function analyzeRefs() {
    if (!refImages.length) {
      showToast("Add reference images first.", "error");
      return;
    }
    setAiBusy("image");
    setStatusMsg(null);
    try {
      const allKeywords: string[] = [];
      const allDesc: string[] = [];
      for (let i = 0; i < refImages.length; i++) {
        const img = refImages[i];
        const r = await describeReferenceImage(img.base64, img.mimeType, { onFallback: fb, onStatus });
        if (r.description) allDesc.push(r.description);
        if (Array.isArray(r.keywords)) allKeywords.push(...r.keywords);
        if (r.subject && i === 0) upd("referenceNote", r.subject);
      }
      const uniqueKw = [...new Set(allKeywords)].slice(0, 40);
      if (uniqueKw.length) upd("keywords", uniqueKw.join(", "));
      if (allDesc.length) upd("description", allDesc.join(". "));
      showToast(`${refImages.length} image(s) analyzed — fields filled.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Analysis failed.", "error");
    } finally {
      setAiBusy(null);
      setStatusMsg(null);
    }
  }

  async function runIpAudit() {
    const text = `${s.keywords} ${s.description} ${s.referenceNote}`.trim();
    if (!text) {
      showToast("Add keywords or description first.", "error");
      return;
    }
    setAiBusy("ip");
    setStatusMsg(null);
    try {
      const r = await ipAuditWithAi(text, { onFallback: fb, onStatus });
      setIpAi(r);
      showToast(
        r.note || (r.safe ? "No IP risks found." : "Review flagged risks."),
        r.safe ? "success" : "error",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Audit failed.", "error");
    } finally {
      setAiBusy(null);
      setStatusMsg(null);
    }
  }

  async function generate() {
    if (busy) return;
    if (!subjectText) {
      showToast("Start with keywords, description, or reference image.", "error");
      return;
    }
    const n = count;
    setAiBusy("generate");
    setStatusMsg(null);
    try {
      const placeholders: OutputItem[] = Array.from({ length: n }, (_, i) => ({
        prompt: "",
        negativePrompt: "",
        variant: i + 1,
        subject: subjectText,
        imageType: s.imageType,
        rasterType: s.rasterType || "",
        vectorType: s.vectorType || "",
        size: sizeLabel(s),
        ratio: s.ratio || "1:1",
        pro: false,
        processing: true,
        ts: Date.now() + i,
      }));
      setOutputs((prev) => [...placeholders, ...prev].slice(0, 200));
      let successCount = 0;
      for (let i = 0; i < n; i++) {
        try {
          const res = await polishOneWithAi(s, null, { onFallback: fb, onStatus });
          setOutputs((prev) =>
            prev.map((o) =>
              o.ts === placeholders[i].ts
                ? {
                    ...o,
                    prompt: res.prompt,
                    negativePrompt: res.negativePrompt,
                    pro: true,
                    processing: false,
                    provider: res.provider,
                  }
                : o,
            ),
          );
          successCount++;
        } catch {
          const local = buildVariants(s, 1)[0];
          setOutputs((prev) =>
            prev.map((o) =>
              o.ts === placeholders[i].ts && local
                ? {
                    ...o,
                    prompt: local.prompt,
                    negativePrompt: local.negativePrompt,
                    pro: false,
                    processing: false,
                  }
                : o,
            ),
          );
        }
      }
      if (successCount > 0) showToast(`${successCount} prompt(s) generated with AI polish.`);
      else showToast("AI unavailable — using local compilation.", "warn");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Generation failed.", "error");
    } finally {
      setAiBusy(null);
      setStatusMsg(null);
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      showToast("Copy failed.", "error");
    }
  }

  async function copyAll() {
    if (!outputs.length) return;
    const allText = outputs.map((o) => o.prompt).join("\n\n");
    try {
      await navigator.clipboard.writeText(allText);
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
      showToast(`Copied ${outputs.length} prompt(s).`);
    } catch {
      showToast("Copy failed.", "error");
    }
  }

  function surpriseMe() {
    upd("keywords", SAMPLE_KEYWORD_SETS[Math.floor(Math.random() * SAMPLE_KEYWORD_SETS.length)]);
  }

  function clearAll() {
    setS(makeDefaultState());
    setOutputs([]);
    setIpAi(null);
    refImages.forEach((r) => URL.revokeObjectURL(r.url));
    setRefImages([]);
    showToast("Form cleared.");
  }

  async function handleCsvFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const items = conceptsFromCsv(text);
      if (!items.length) {
        showToast('No concepts found — add a "subject" column.', "error");
        return;
      }
      const built: OutputItem[] = [];
      items.forEach((c, idx) => {
        const state = { ...s, keywords: c.subject || s.keywords };
        const t = compileMicrostockPrompt(state);
        if (!t) return;
        built.push({
          ts: Date.now() + idx,
          variant: idx + 1,
          subject: c.subject,
          imageType: t.imageType,
          rasterType: t.rasterType,
          vectorType: t.vectorType,
          size: t.size,
          ratio: t.ratio,
          prompt: t.prompt,
          negativePrompt: t.negativePrompt,
          pro: false,
        });
      });
      if (built.length) {
        setOutputs((prev) => [...built, ...prev].slice(0, 200));
        showToast(`Built ${built.length} prompts from CSV.`);
      } else {
        showToast("Nothing built — check subject column.", "warn");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not read CSV.", "error");
    } finally {
      if (csvInput.current) csvInput.current.value = "";
    }
  }

  function exportCsv() {
    if (!outputs.length) {
      showToast("Nothing to export.", "error");
      return;
    }
    downloadText(buildPromptCsv(outputs), `prompts-${Date.now()}.csv`);
    showToast(`Exported ${outputs.length} prompt(s) to CSV.`);
  }

  function exportTxt() {
    if (!outputs.length) {
      showToast("Nothing to export.", "error");
      return;
    }
    downloadText(buildPromptTxt(outputs), `prompts-${Date.now()}.txt`, "text/plain;charset=utf-8;");
    showToast(`Exported ${outputs.length} prompt(s) to TXT.`);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
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
            Turn keywords + reference images into best, unique, 100% microstock-acceptable prompts. Pick
            raster or vector, tune filters, then export clean prompts to TXT or CSV.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setShowDocs(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-brand dark:border-slate-700 dark:text-slate-300"
          >
            <I d={ICONS.book} className="h-3.5 w-3.5" /> Guide
          </button>
          <span className="hidden items-center gap-1 text-[10px] text-slate-400 md:inline-flex">
            <I d={ICONS.sparkles} className="h-3 w-3" /> Ctrl/⌘ + Enter to generate
          </span>
        </div>
      </header>

      {/* Engine tabs */}
      <div className="mb-5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[11px] font-bold text-white shadow-sm">
          <I d={ICONS.sparkles} className="h-3 w-3" /> Manual Engine
        </span>
        <Link
          href="/tools/prompt-generator/auto"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-300"
        >
          <I d={ICONS.sparkles} className="h-3 w-3" /> Auto Engine
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Concept & research"
            subtitle="Keywords are the core — description and reference images are optional"
            icon={<I d={ICONS.search} className="h-4 w-4" />}
            action={
              <button
                type="button"
                onClick={surpriseMe}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
              >
                <I d={ICONS.sparkles} className="h-3 w-3" /> Surprise me
              </button>
            }
          >
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-end justify-between gap-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Keywords *
                  </label>
                  <button
                    type="button"
                    onClick={doResearch}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline disabled:opacity-50"
                  >
                    {aiBusy === "keywords" ? SPINNER : <I d={ICONS.search} className="h-3 w-3" />}
                    Research with AI
                  </button>
                </div>
                <textarea
                  value={s.keywords}
                  onChange={setStr("keywords")}
                  placeholder="e.g. minimalist desk setup, warm morning light, coffee, notebook"
                  rows={2}
                  className="w-full resize-y rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:font-normal placeholder:text-slate-400 focus:border-brand focus:outline-none transition-colors"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  AI research expands these into deeper, sales-optimized microstock keywords.
                </p>
              </div>

              <Area
                label="Describe the concept (optional)"
                value={s.description}
                onChange={setStr("description")}
                placeholder="e.g. a clean, high-contrast workspace with laptop, warm sunlight, shallow depth of field"
                rows={2}
              />

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Reference images — optional (bulk upload)
                </label>
                {refImages.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {refImages.map((r, i) => (
                        <div key={`${r.name}-${i}`} className="group relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.url}
                            alt={r.name}
                            className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-100 object-contain dark:border-slate-700 dark:bg-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => removeRefImage(i)}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <I d={ICONS.x} className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => refInput.current?.click()}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:border-brand dark:border-slate-700 dark:text-slate-300"
                      >
                        <I d={ICONS.plus} className="h-3 w-3" /> Add more
                      </button>
                      <button
                        type="button"
                        onClick={analyzeRefs}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[10px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        {aiBusy === "image" ? SPINNER : <I d={ICONS.imagePlus} className="h-3 w-3" />}
                        Analyze all with AI
                      </button>
                      <button
                        type="button"
                        onClick={clearAllRefs}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:border-red-400 hover:text-red-500 dark:border-slate-700 dark:text-slate-300"
                      >
                        <I d={ICONS.trash} className="h-3 w-3" /> Clear all
                      </button>
                    </div>
                    {s.referenceNote ? (
                      <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        Detected: {s.referenceNote}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => refInput.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 px-3 py-5 text-[11px] font-bold text-slate-400 transition-colors hover:border-brand hover:text-brand dark:border-slate-600 dark:text-slate-500"
                  >
                    <I d={ICONS.upload} className="mx-auto mb-1 h-4 w-4" />
                    Click to upload reference images (optional — multiple allowed)
                  </button>
                )}
                <input
                  ref={refInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleRefFiles(e.target.files)}
                />
              </div>

              <Area
                label="Negative prompt (optional)"
                value={s.negativeWords}
                onChange={setStr("negativeWords")}
                placeholder="comma-separated things to always avoid, e.g. blurry, low quality, watermark"
                rows={2}
              />
            </div>
          </Card>

          <Card
            title="IP / copyright check"
            subtitle="Protects against microstock rejections"
            icon={<I d={ICONS.shield} className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <Toggle
                checked={s.ipCheck === true}
                onChange={(v) => upd("ipCheck", v)}
                label="Protect from IP/copyright violations"
                note="When enabled, prompt generation automatically avoids brands, trademarks, copyrighted characters, and celebrity likenesses."
              />

              {ipRisks.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live scan
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ipRisks.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
                      >
                        ⚠ {t}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runIpAudit}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-brand disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  {aiBusy === "ip" ? SPINNER : <I d={ICONS.shield} className="h-3.5 w-3.5" />}
                  Run AI IP audit
                </button>
                {ipAi ? (
                  <span
                    className={`rounded border px-2 py-1 text-[10px] font-bold ${
                      ipAi.safe
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                        : "border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
                    }`}
                  >
                    {ipAi.safe ? "Safe" : "Risky"}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>

          <Card
            title="Generate"
            subtitle="AI-polished prompts with all filters applied"
            icon={<I d={ICONS.sparkles} className="h-4 w-4" />}
          >
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy || !subjectText}
                onClick={generate}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-lg shadow-brand/20 transition-colors hover:opacity-90 disabled:opacity-40"
              >
                {busy ? SPINNER : <I d={ICONS.sparkles} className="h-3.5 w-3.5" />}
                Generate {count} {count === 1 ? "prompt" : "prompts"} — AI polished
              </button>
              {statusMsg ? (
                <p className="text-center text-[10px] font-semibold text-brand">{statusMsg}</p>
              ) : null}
              <p className="text-[10px] leading-relaxed text-slate-400">
                AI polish uses your configured{" "}
                <Link href="/generator?keys=1" className="font-semibold text-brand underline">
                  API keys
                </Link>{" "}
                and respects your min/max character bounds while keeping all filters intact.
              </p>
            </div>
          </Card>
        </div>

        {/* Filters sidebar */}
        <div className="space-y-4 self-start lg:sticky lg:top-20">
          <Card
            title="Filters"
            subtitle="Type, color, trace and size"
            icon={<I d={ICONS.layers} className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Image type
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {IMAGE_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectImageType(t.id)}
                      title={t.note}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${
                        s.imageType === t.id
                          ? "border-brand bg-brand text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      }`}
                    >
                      <I d={t.id === "raster" ? ICONS.image : ICONS.layers} className="h-3 w-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {IMAGE_TYPES.find((t) => t.id === s.imageType)?.note}
                </p>
              </div>

              {s.imageType === "raster" ? (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Raster type
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {RASTER_TYPES.map((r) => (
                      <Chip
                        key={r.id}
                        active={s.rasterType === r.id}
                        onClick={() => upd("rasterType", r.id)}
                        title={r.phrase}
                      >
                        {r.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Vector color format
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {VECTOR_COLOR_FORMATS.map((c) => (
                        <Chip
                          key={c.id}
                          active={s.vectorColorFormat === c.id}
                          onClick={() => upd("vectorColorFormat", c.id)}
                          title={c.phrase}
                        >
                          {c.label}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {s.vectorColorFormat === "color" ? (
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Color count
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {VECTOR_COLOR_COUNTS.map((n) => (
                          <Chip
                            key={n}
                            active={String(s.vectorColorCount) === String(n)}
                            onClick={() => upd("vectorColorCount", n)}
                          >
                            {n}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Vector type
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {VECTOR_TYPES.map((v) => (
                        <Chip
                          key={v.id}
                          active={s.vectorType === v.id}
                          onClick={() => upd("vectorType", v.id)}
                          title={v.phrase}
                        >
                          {v.label}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {s.vectorType === "icon" ? (
                    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Icon mode
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ICON_MODES.map((m) => (
                            <Chip key={m.id} active={s.iconMode === m.id} onClick={() => upd("iconMode", m.id)}>
                              {m.label}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      {s.iconMode === "multi" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Icon count" value={s.iconCount} onChange={setStr("iconCount")} min={2} max={32} placeholder="4" />
                          <Num label="Columns" value={s.iconColCount} onChange={setStr("iconColCount")} min={1} max={8} placeholder="4" />
                          <div className="col-span-2">
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Layout
                            </p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {ICON_LAYOUTS.map((l) => (
                                <Chip key={l.id} active={s.iconLayout === l.id} onClick={() => upd("iconLayout", l.id)}>
                                  {l.label}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <Toggle
                    checked={s.traceFriendly !== false}
                    onChange={(v) => upd("traceFriendly", v)}
                    label="Trace-friendly output"
                    note="Simple shapes, smooth closed paths, few anchor points."
                  />
                  <p className="flex items-center gap-1 text-[10px] text-slate-400">
                    <I d={ICONS.shield} className="h-3 w-3" /> Vectors use flat colors — no gradient, no shading.
                  </p>
                </>
              )}

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Size & aspect ratio
                </p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {presetList.map((p) => (
                    <Chip key={p.id} active={s.sizeId === p.id} onClick={() => upd("sizeId", p.id)} title={p.note}>
                      {p.label}
                    </Chip>
                  ))}
                  <Chip active={s.sizeId === "custom"} onClick={() => upd("sizeId", "custom")}>
                    Custom
                  </Chip>
                </div>
                {s.sizeId === "custom" ? (
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <Num label="Width (px)" value={s.customW} onChange={setStr("customW")} min={0} placeholder="e.g. 1024" />
                    <Num label="Height (px)" value={s.customH} onChange={setStr("customH")} min={0} placeholder="e.g. 1024" />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_RATIOS.map((r) => (
                    <Chip key={r.value} active={s.ratio === r.value} onClick={() => upd("ratio", r.value)} title={r.label}>
                      {r.value}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Output settings"
            subtitle="How many prompts and character length"
            icon={<I d={ICONS.ruler} className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <Num label="Number of prompts" value={s.count} onChange={setStr("count")} min={1} max={100} placeholder="3" suffix="(1–100)" />
              <Num label="Min prompt length (chars)" value={s.minChars} onChange={setStr("minChars")} min={0} placeholder="1500" suffix="(optional)" />
              <Num label="Max prompt length (chars)" value={s.maxChars} onChange={setStr("maxChars")} min={0} placeholder="2200" suffix="(optional)" />
            </div>
          </Card>

          <Card title="Bulk actions" subtitle="Import CSV, clear form" icon={<I d={ICONS.fileDown} className="h-4 w-4" />}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => csvInput.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-brand dark:border-slate-700 dark:text-slate-300"
              >
                <I d={ICONS.upload} className="h-3.5 w-3.5" /> Import CSV
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-red-400 hover:text-red-500 dark:border-slate-700 dark:text-slate-400"
              >
                <I d={ICONS.refresh} className="h-3.5 w-3.5" /> Clear
              </button>
              <input
                ref={csvInput}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => handleCsvFile(e.target.files?.[0])}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              CSV needs a <b>subject</b> column. Each row compiles with current filters.
            </p>
          </Card>
        </div>
      </div>

      {/* Outputs */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <I d={ICONS.sparkles} className="h-4 w-4 text-brand" /> Generated prompts
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
              {outputs.length}
            </span>
          </h2>
          {outputs.length > 0 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90"
              >
                {bulkCopied ? <I d={ICONS.check} className="h-3 w-3" /> : <I d={ICONS.copy} className="h-3 w-3" />}
                {bulkCopied ? "Copied!" : `Copy all (${outputs.length})`}
              </button>
              <button
                type="button"
                onClick={exportTxt}
                disabled={!outputs.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-[11px] font-bold text-brand transition-colors hover:bg-brand/5 disabled:opacity-40"
              >
                <I d={ICONS.fileText} className="h-3 w-3" /> TXT
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!outputs.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-[11px] font-bold text-brand transition-colors hover:bg-brand/5 disabled:opacity-40"
              >
                <I d={ICONS.fileDown} className="h-3 w-3" /> CSV
              </button>
            </div>
          ) : null}
        </div>
        {outputs.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {outputs.map((o, i) => (
              <div
                key={`${o.ts}-${i}`}
                className="rounded-2xl border border-slate-200 bg-surface p-3 dark:border-slate-800"
              >
                {o.processing ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    <span className="text-[10px] font-bold text-brand">
                      Generating prompt {o.variant}...
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                        {o.variant}. {o.subject || "Prompt"}
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(o.prompt, `${o.ts}-${i}`)}
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-brand hover:underline"
                      >
                        {copiedId === `${o.ts}-${i}` ? (
                          <I d={ICONS.check} className="h-3 w-3" />
                        ) : (
                          <I d={ICONS.copy} className="h-3 w-3" />
                        )}
                        Copy
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{o.prompt}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold capitalize text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                        {o.imageType}
                      </span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                        {o.size}
                      </span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                        {o.ratio}
                      </span>
                      {o.pro ? (
                        <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
                          AI polished
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
            <p className="text-[11px] leading-relaxed text-slate-400">
              No prompts yet. Set keywords + filters, then hit <b>Generate</b> — or press{" "}
              <b>Ctrl/⌘ + Enter</b>.
            </p>
          </div>
        )}
      </section>

      {/* Guide modal */}
      {showDocs ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDocs(false)} />
          <div className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <I d={ICONS.book} className="h-4 w-4 text-brand" /> How it works
              </h3>
              <button
                type="button"
                onClick={() => setShowDocs(false)}
                className="text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
              >
                <I d={ICONS.x} className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              <div>
                <p className="mb-1 font-bold text-slate-900 dark:text-white">1. Concept</p>
                <p>
                  Type <b>keywords</b> or use <b>Research with AI</b>. Add a <b>description</b> or upload{" "}
                  <b>reference images</b> (bulk) — AI analyzes them all and fills the fields.
                </p>
              </div>
              <div>
                <p className="mb-1 font-bold text-slate-900 dark:text-white">2. IP / copyright check</p>
                <p>
                  Enable the <b>protection toggle</b> and prompt generation automatically avoids brands,
                  trademarks, copyrighted characters, and celebrities.
                </p>
              </div>
              <div>
                <p className="mb-1 font-bold text-slate-900 dark:text-white">3. Filters</p>
                <p>
                  Pick <b>Raster</b> or <b>Vector</b>. Vector adds color format, type, icon grids, and
                  trace-friendly output. Size presets + aspect ratio in one place.
                </p>
              </div>
              <div>
                <p className="mb-1 font-bold text-slate-900 dark:text-white">4. Generate & export</p>
                <p>
                  Hit <b>Generate</b> — AI-polished prompts respect all filters and character bounds.{" "}
                  <b>Copy all</b> to clipboard, or export to <b>TXT</b> / <b>CSV</b>. One prompt per line,
                  no prefixes.
                </p>
              </div>
              <div>
                <p className="mb-1 font-bold text-slate-900 dark:text-white">Keyboard shortcuts</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>
                    <b>Ctrl/⌘ + Enter</b> — generate
                  </li>
                  <li>
                    <b>Esc</b> — close this guide
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ToolToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
