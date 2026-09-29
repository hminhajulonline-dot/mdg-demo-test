"use client";

import type { GeneratorUserSettings } from "@/lib/types";
import { AI_DISCLOSURE } from "@/lib/csv/dreamstimeRules";

export const PLATFORM_TILES = [
  { id: "adobestock", name: "Adobe Stock", short: "St" },
  { id: "shutterstock", name: "Shutterstock", short: "Sh" },
  { id: "freepik", name: "Magnific (freepik)", short: "Mg" },
  { id: "vecteezy", name: "Vecteezy", short: "Vc" },
  { id: "pond5", name: "Pond5", short: "P5" },
  { id: "depositphotos", name: "Depositphotos", short: "Dp" },
  { id: "123rf", name: "123RF", short: "12" },
  { id: "dreamstime", name: "Dreamstime", short: "Dr" },
  { id: "general", name: "General", short: "✦" },
] as const;

interface Props {
  settings: GeneratorUserSettings;
  update: <K extends keyof GeneratorUserSettings>(key: K, value: GeneratorUserSettings[K]) => void;
  platform: string;
  setPlatform: (p: string) => void;
}

export default function ControlsPanel({ settings, update, platform, setPlatform }: Props) {
  const isMetadata = settings.mode === "metadata";
  const isDream = platform === "dreamstime";

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
        <ModeButton
          active={isMetadata}
          onClick={() => update("mode", "metadata")}
          label="Metadata"
        />
        <ModeButton
          active={!isMetadata}
          onClick={() => update("mode", "img2prompt")}
          label="Prompt"
        />
      </div>

      {/* Settings card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold">
            {isMetadata ? "Metadata Settings" : "Prompt Controls"}
          </p>
        </div>

        <div className="px-4 pb-4 space-y-4">
          {isMetadata ? (
            <>
              {/* Export platform tiles */}
              <div>
                <SectionLabel>Export Platform</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORM_TILES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPlatform(p.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        platform === p.id
                          ? "bg-brand text-white border-brand"
                          : "border-slate-200 dark:border-slate-700 hover:border-brand/60"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded text-[8px] font-bold flex items-center justify-center shrink-0 ${
                          platform === p.id
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 dark:bg-slate-800"
                        }`}
                      >
                        {p.short}
                      </span>
                      <span className="flex-1 text-left truncate">{p.name}</span>
                      {platform === p.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <RangeSlider
                label="Title length"
                min={5}
                max={250}
                step={5}
                valueMin={settings.titleLengthMin}
                valueMax={settings.titleLengthMax}
                onChangeMin={(v) => update("titleLengthMin", Math.min(v, settings.titleLengthMax - 5))}
                onChangeMax={(v) => update("titleLengthMax", Math.max(v, settings.titleLengthMin + 5))}
                suffix="chars"
                hint="Title length is enforced — longer responses are truncated at a word boundary."
              />

              <RangeSlider
                label="Description length"
                min={isDream ? 50 : 5}
                max={isDream ? 756 : 80}
                step={isDream ? 10 : 1}
                valueMin={settings.descriptionLengthMin}
                valueMax={settings.descriptionLengthMax}
                onChangeMin={(v) =>
                  update("descriptionLengthMin", Math.min(v, settings.descriptionLengthMax - 1))
                }
                onChangeMax={(v) =>
                  update("descriptionLengthMax", Math.max(v, settings.descriptionLengthMin + 1))
                }
                suffix={isDream ? "chars" : "words"}
                hint={
                  isDream
                    ? "Dreamstime measures the description in characters (≤ 756)."
                    : "Description length is enforced in words; longer responses are trimmed."
                }
              />

              <RangeSlider
                label="Keywords count"
                min={5}
                max={80}
                step={1}
                valueMin={settings.keywordsCountMin}
                valueMax={settings.keywordsCountMax}
                onChangeMin={(v) => update("keywordsCountMin", Math.min(v, settings.keywordsCountMax - 1))}
                onChangeMax={(v) => update("keywordsCountMax", Math.max(v, settings.keywordsCountMin + 1))}
                suffix="keywords"
                hint="Extras are dropped; if the LLM returns too few we re-prompt once for more."
              />

              <div>
                <SectionLabel>Options</SectionLabel>
                <ToggleWithInput
                  label="Prefix"
                  placeholder='e.g. "Premium · "'
                  hint="Always added to the start of every title."
                  checked={settings.usePrefix}
                  onToggle={(v) => update("usePrefix", v)}
                  value={settings.prefix}
                  onChange={(v) => update("prefix", v)}
                />
                <ToggleWithInput
                  label="Suffix"
                  placeholder='e.g. " · 4K"'
                  hint="Always added to the end of every title."
                  checked={settings.useSuffix}
                  onToggle={(v) => update("useSuffix", v)}
                  value={settings.suffix}
                  onChange={(v) => update("suffix", v)}
                />
                <ToggleWithInput
                  label="Description Prefix"
                  placeholder='e.g. "Stock image of "'
                  hint="Always added to the start of every description."
                  checked={settings.useDescPrefix}
                  onToggle={(v) => update("useDescPrefix", v)}
                  value={settings.descPrefix}
                  onChange={(v) => update("descPrefix", v)}
                />
                <ToggleWithInput
                  label="Description Suffix"
                  placeholder='e.g. " Ideal for print and web."'
                  hint={
                    isDream
                      ? "Added to the end of every description, before the AI notice."
                      : "Always added to the end of every description."
                  }
                  checked={settings.useDescSuffix}
                  onToggle={(v) => update("useDescSuffix", v)}
                  value={settings.descSuffix}
                  onChange={(v) => update("descSuffix", v)}
                />
                <ToggleWithInput
                  label="Negative Title Words"
                  placeholder="comma-separated, e.g. cheap, ugly, low quality"
                  hint="AI will avoid these words in the title."
                  checked={settings.useNegativeTitle}
                  onToggle={(v) => update("useNegativeTitle", v)}
                  value={settings.negativeTitleWords}
                  onChange={(v) => update("negativeTitleWords", v)}
                />
                <ToggleWithInput
                  label="Negative Keywords"
                  placeholder="comma-separated, e.g. nsfw, brand names, logos"
                  hint="AI will avoid these as keywords."
                  checked={settings.useNegativeKeywords}
                  onToggle={(v) => update("useNegativeKeywords", v)}
                  value={settings.negativeKeywords}
                  onChange={(v) => update("negativeKeywords", v)}
                />
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-[11px] text-amber-700 dark:text-amber-300">
                <span>
                  &quot;isolated on transparent background&quot; is auto-added for PNGs.
                </span>
              </div>

              <OptionalBlock settings={settings} update={update} />

              {platform === "dreamstime" ? (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1">
                  <SectionLabel>Dreamstime rules</SectionLabel>
                  <Toggle
                    label="This is AI-generated"
                    checked={settings.isAIGenerated}
                    onChange={(v) => update("isAIGenerated", v)}
                  />
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {settings.isAIGenerated
                      ? `Categories are detected automatically, "Illustrations & Clipart / AI generated" is added for you, and every description ends with "${AI_DISCLOSURE}".`
                      : "Categories are detected automatically from the image (max 3)."}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Toggle
                label="White Background"
                checked={settings.whiteBackground}
                onChange={(v) => update("whiteBackground", v)}
              />
              <Toggle
                label="Camera Parameters"
                checked={settings.cameraParameters}
                onChange={(v) => update("cameraParameters", v)}
              />

              <RangeSlider
                label="Prompt length"
                min={50}
                max={1500}
                step={25}
                valueMin={settings.promptLengthMin}
                valueMax={settings.promptLengthMax}
                onChangeMin={(v) => update("promptLengthMin", Math.min(v, settings.promptLengthMax - 50))}
                onChangeMax={(v) => update("promptLengthMax", Math.max(v, settings.promptLengthMin + 50))}
                suffix="chars"
                hint="Output is guaranteed to fall in this range — short responses are re-prompted, long ones are truncated."
              />

              <div>
                <SectionLabel>Options</SectionLabel>
                <ToggleWithInput
                  label="Prefix"
                  placeholder="Text to prepend to the prompt"
                  hint="Prepended to every generated prompt."
                  checked={settings.usePrefix}
                  onToggle={(v) => update("usePrefix", v)}
                  value={settings.prefix}
                  onChange={(v) => update("prefix", v)}
                />
                <ToggleWithInput
                  label="Suffix"
                  placeholder="Text to append to the prompt"
                  hint="Appended to every generated prompt."
                  checked={settings.useSuffix}
                  onToggle={(v) => update("useSuffix", v)}
                  value={settings.suffix}
                  onChange={(v) => update("suffix", v)}
                />
                <ToggleWithInput
                  label="Negative Prompt Words"
                  placeholder="comma-separated, e.g. blurry, lowres, watermark"
                  hint="AI will avoid these words in the prompt."
                  checked={settings.useNegativePrompt}
                  onToggle={(v) => update("useNegativePrompt", v)}
                  value={settings.negativePromptWords}
                  onChange={(v) => update("negativePromptWords", v)}
                />
              </div>

              <OptionalBlock settings={settings} update={update} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                        */
/* ------------------------------------------------------------------ */

function OptionalBlock({
  settings,
  update,
}: {
  settings: GeneratorUserSettings;
  update: Props["update"];
}) {
  return (
    <div>
      <SectionLabel>Optional</SectionLabel>
      <Toggle
        label="Single Word Keywords"
        checked={settings.singleWordKw}
        onChange={(v) => update("singleWordKw", v)}
      />
      <Toggle
        label="Silhouette"
        checked={settings.silhouette}
        onChange={(v) => update("silhouette", v)}
      />
      <Toggle
        label="Transparent Background"
        checked={settings.transparent}
        onChange={(v) => update("transparent", v)}
      />
      <ToggleWithInput
        label="Custom Prompt"
        placeholder="Extra instructions for the AI..."
        hint="Appended to the generation instructions."
        checked={settings.useCustomPrompt}
        onToggle={(v) => update("useCustomPrompt", v)}
        value={settings.customPrompt}
        onChange={(v) => update("customPrompt", v)}
      />
      <ToggleWithInput
        label="Prohibited Words"
        placeholder="comma-separated, e.g. brand names, logos, generic"
        hint="The AI will never use these in the title, description, keywords or prompt."
        checked={settings.useProhibitedWords}
        onToggle={(v) => update("useProhibitedWords", v)}
        value={settings.prohibitedWords}
        onChange={(v) => update("prohibitedWords", v)}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
      {children}
    </p>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
        active
          ? "bg-brand text-white shadow"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function RangeSlider({
  label,
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  suffix,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  suffix: string;
  hint?: string;
}) {
  const clamp = (v: number) =>
    Number.isFinite(v) ? Math.max(min, Math.min(v, max)) : min;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-[11px] font-bold">
          {valueMin}-{valueMax} {suffix}
        </span>
      </div>
      <div className="space-y-2">
        <RangeRow
          tag="Min"
          value={valueMin}
          min={min}
          max={max}
          step={step}
          onChange={(v) => onChangeMin(clamp(v))}
        />
        <RangeRow
          tag="Max"
          value={valueMax}
          min={min}
          max={max}
          step={step}
          onChange={(v) => onChangeMax(clamp(v))}
        />
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function RangeRow({
  tag,
  value,
  min,
  max,
  step,
  onChange,
}: {
  tag: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider w-7">
        {tag}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--brand)]"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-background text-[10px] font-bold text-right focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs font-semibold">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

function ToggleWithInput({
  label,
  checked,
  onToggle,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <ToggleSwitch checked={checked} onChange={onToggle} />
      </div>
      {checked && (
        <div className="mt-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={300}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-background text-[11px] focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-slate-400"
          />
          {hint && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{hint}</p>}
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full flex items-center transition-colors shrink-0 ${
        checked ? "bg-brand justify-end" : "bg-slate-200 dark:bg-slate-700 justify-start"
      }`}
    >
      <div className="w-4 h-4 rounded-full bg-white shadow-sm mx-0.5" />
    </button>
  );
}
