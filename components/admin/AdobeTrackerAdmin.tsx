"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackerSettings } from "@/lib/adobe-tracker/types";
import { maskKey } from "@/lib/client/apiKeys";

interface PoolKey {
  id: string;
  label: string;
  key: string;
  active: boolean;
}

interface TestResult {
  ok: boolean;
  label: string;
}

const SPINNER = (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ICON = {
  trending:
    "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  key: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
  plus: "M12 4.5v15m7.5-7.5h-15",
  trash:
    "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.31 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
  check: "M4.5 12.75l6 6 9-13.5",
  save: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
};

const I = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const CARD = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900";
const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800";
const INPUT_SM =
  "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold transition-all hover:border-brand hover:text-brand disabled:opacity-40 dark:border-slate-700";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40";

function numOr(v: string, fallback: number, min: number, max: number): number {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default function AdobeTrackerAdmin() {
  // ── Settings card ──────────────────────────────────────────
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Key pool card ──────────────────────────────────────────
  const [keys, setKeys] = useState<PoolKey[] | null>(null);
  // Pristine snapshot of the last loaded rows - diffs run against this,
  // never against the draft state being edited.
  const loadedRef = useRef<PoolKey[]>([]);
  const [savingKeys, setSavingKeys] = useState(false);
  const [testing, setTesting] = useState("");
  const [testResult, setTestResult] = useState<Record<string, TestResult | null>>({});
  const [keysMsg, setKeysMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, kRes] = await Promise.all([
          fetch("/api/admin/adobe-tracker"),
          fetch("/api/admin/adobe-tracker/keys"),
        ]);
        const sJson = await sRes.json();
        const kJson = await kRes.json();
        if (!sRes.ok) throw new Error(sJson?.error || "Failed to load settings.");
        if (!kRes.ok) throw new Error(kJson?.error || "Failed to load key pool.");
        if (!cancelled) {
          setSettings(sJson.settings);
          setKeys(kJson.keys || []);
          loadedRef.current = kJson.keys || [];
        }
      } catch (err) {
        if (!cancelled) {
          setSettingsMsg({ ok: false, text: err instanceof Error ? err.message : "Load failed." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(p: Partial<TrackerSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSettingsMsg(null);
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch("/api/admin/adobe-tracker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      setSettings(json.settings);
      setSettingsMsg({ ok: true, text: "Settings saved." });
    } catch (err) {
      setSettingsMsg({ ok: false, text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSavingSettings(false);
    }
  }

  async function persistKeys(next: PoolKey[]) {
    setSavingKeys(true);
    setKeysMsg(null);
    try {
      // Diff against the loaded snapshot: PATCH changes, POST new rows, DELETE removed.
      const loaded = loadedRef.current;
      const loadedIds = new Set(loaded.map((k) => k.id));
      const ops: Promise<Response>[] = [];
      for (const k of next) {
        if (loadedIds.has(k.id)) {
          const prev = loaded.find((x) => x.id === k.id);
          if (prev && (prev.label !== k.label || prev.key !== k.key || prev.active !== k.active)) {
            ops.push(
              fetch("/api/admin/adobe-tracker/keys", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(k),
              })
            );
          }
        } else {
          ops.push(
            fetch("/api/admin/adobe-tracker/keys", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label: k.label, key: k.key, active: k.active }),
            })
          );
        }
      }
      for (const prev of loaded) {
        if (!next.some((k) => k.id === prev.id)) {
          ops.push(
            fetch(`/api/admin/adobe-tracker/keys?id=${encodeURIComponent(prev.id)}`, {
              method: "DELETE",
            })
          );
        }
      }
      const results = await Promise.all(ops);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const json = await failed.json().catch(() => ({}));
        throw new Error(json?.error || "Save failed.");
      }
      // Reload so newly created rows get their server-generated ids.
      const res = await fetch("/api/admin/adobe-tracker/keys");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Reload failed.");
      setKeys(json.keys || []);
      loadedRef.current = json.keys || [];
    } catch (err) {
      setKeysMsg({ ok: false, text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSavingKeys(false);
    }
  }

  function updateKey(id: string, p: Partial<PoolKey>) {
    setKeys((prev) => (prev ? prev.map((k) => (k.id === id ? { ...k, ...p } : k)) : prev));
  }

  function addKey() {
    setKeys((prev) => [
      ...(prev || []),
      { id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: "", key: "", active: true },
    ]);
    setKeysMsg(null);
  }

  async function testKey(id: string, key: string) {
    setTesting(id);
    setTestResult((p) => ({ ...p, [id]: null }));
    try {
      const params = new URLSearchParams({ action: "test" });
      if (id.startsWith("new_")) params.set("key", key);
      else params.set("id", id);
      const res = await fetch(`/api/admin/adobe-tracker/keys?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Test failed.");
      const st = json.status || {};
      setTestResult((p) => ({
        ...p,
        [id]: st.connected
          ? {
              ok: true,
              label: `${st.username || "key"}${st.planId ? ` · ${st.planId}` : st.planTier ? ` · ${st.planTier}` : ""}`,
            }
          : { ok: false, label: st.error || "Invalid" },
      }));
    } catch (err) {
      setTestResult((p) => ({
        ...p,
        [id]: { ok: false, label: err instanceof Error ? err.message : "Failed" },
      }));
    } finally {
      setTesting("");
    }
  }

  return (
    <>
      {/* ── Limits card ─────────────────────────────────────── */}
      <section className={CARD}>
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
          <I d={ICON.trending} className="h-4 w-4 text-brand" /> Adobe Tracker limits
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Who may search, how many searches per day and how many results each search returns —
          enforced server-side. Daily searches <strong>-1</strong> means unlimited. After the quota
          runs out, users are asked for their own Apify key (if enabled below).
        </p>

        {!settings ? (
          <p className="py-4 text-center text-xs text-slate-400">{SPINNER} Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Access</p>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                    className="accent-brand"
                  />
                  Tool enabled
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.contributorEnabled}
                    onChange={(e) => patch({ contributorEnabled: e.target.checked })}
                    className="accent-brand"
                  />
                  Contributor search allowed
                </label>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="flex-1">Daily searches (-1 = unlimited)</span>
                  <input
                    type="number"
                    min={-1}
                    value={settings.dailySearches}
                    onChange={(e) => patch({ dailySearches: numOr(e.target.value, -1, -1, 100000) })}
                    className={`${INPUT_SM} w-24`}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="flex-1">Results per search (1–50)</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings.resultsPerSearch}
                    onChange={(e) => patch({ resultsPerSearch: numOr(e.target.value, 20, 1, 50) })}
                    className={`${INPUT_SM} w-24`}
                  />
                </div>
              </div>

              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Keys &amp; panel</p>
                <label className="block text-xs text-slate-600 dark:text-slate-300">
                  <span className="mb-1 block font-semibold">Which key serves searches</span>
                  <select
                    value={settings.apiSource}
                    onChange={(e) =>
                      patch({ apiSource: e.target.value as TrackerSettings["apiSource"] })
                    }
                    className={INPUT}
                  >
                    <option value="auto">Auto — site quota first, own key after</option>
                    <option value="admin">Site keys only (ignore user keys)</option>
                    <option value="user">Own key only (required)</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.apiPanelEnabled}
                    onChange={(e) => patch({ apiPanelEnabled: e.target.checked })}
                    className="accent-brand"
                  />
                  In-tool API manager visible
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.byoEnabled}
                    onChange={(e) => patch({ byoEnabled: e.target.checked })}
                    className="accent-brand"
                  />
                  Own-key system (popup + panel)
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <label className="block text-xs text-slate-600 dark:text-slate-300">
                <span className="mb-1 block font-semibold">Popup title</span>
                <input
                  type="text"
                  value={settings.byoTitle}
                  onChange={(e) => patch({ byoTitle: e.target.value })}
                  className={INPUT}
                />
              </label>
              <label className="block text-xs text-slate-600 dark:text-slate-300">
                <span className="mb-1 block font-semibold">Popup message</span>
                <textarea
                  value={settings.byoMessage}
                  onChange={(e) => patch({ byoMessage: e.target.value })}
                  rows={3}
                  className={`${INPUT} resize-y`}
                />
              </label>
              <label className="block text-xs text-slate-600 dark:text-slate-300">
                <span className="mb-1 block font-semibold">Guide text</span>
                <textarea
                  value={settings.byoGuide}
                  onChange={(e) => patch({ byoGuide: e.target.value })}
                  rows={4}
                  className={`${INPUT} resize-y`}
                />
              </label>
              <label className="block text-xs text-slate-600 dark:text-slate-300">
                <span className="mb-1 block font-semibold">Guide button URL (hidden when empty)</span>
                <input
                  type="text"
                  value={settings.byoGuideUrl || ""}
                  onChange={(e) => patch({ byoGuideUrl: e.target.value })}
                  placeholder="https://…"
                  className={INPUT}
                />
              </label>
            </div>

            {settingsMsg && (
              <p
                className={`text-xs ${settingsMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
              >
                {settingsMsg.text}
              </p>
            )}
            <button onClick={saveSettings} disabled={savingSettings} className={BTN_PRIMARY}>
              {savingSettings ? SPINNER : <I d={ICON.save} className="h-3.5 w-3.5" />}
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
      </section>

      {/* ── Site API key pool card ──────────────────────────── */}
      <section className={CARD}>
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
          <I d={ICON.key} className="h-4 w-4 text-brand" /> Adobe Tracker — site API pool
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Add one or more Apify keys. Requests rotate with automatic failover — a dead key is
          skipped. Keys live in the admin-only <code>adobe_tracker_keys</code> table, never in the
          browser. Saved immediately (no Save-settings click needed).
        </p>
        {keysMsg && (
          <p
            className={`mb-3 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              keysMsg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "border-red-200 bg-red-50 text-red-500 dark:border-red-900/40 dark:bg-red-900/20"
            }`}
          >
            {keysMsg.text}
          </p>
        )}
        {keys === null ? (
          <p className="py-4 text-center text-xs text-slate-400">{SPINNER} Loading pool…</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => {
              const tr = testResult[k.id];
              return (
                <div
                  key={k.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={k.label}
                      onChange={(e) => updateKey(k.id, { label: e.target.value })}
                      onBlur={() => persistKeys(keys)}
                      placeholder="Label (e.g. Main)"
                      className={`${INPUT_SM} w-28`}
                    />
                    <input
                      type="password"
                      value={k.key}
                      onChange={(e) => updateKey(k.id, { key: e.target.value })}
                      onBlur={() => persistKeys(keys)}
                      placeholder="Paste Apify key…"
                      className={`${INPUT_SM} min-w-[140px] flex-1 font-mono`}
                    />
                    <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={k.active}
                        onChange={(e) => {
                          updateKey(k.id, { active: e.target.checked });
                          void persistKeys(keys.map((x) => (x.id === k.id ? { ...x, active: e.target.checked } : x)));
                        }}
                        className="accent-brand"
                      />
                      Active
                    </label>
                    <button
                      onClick={() => void testKey(k.id, k.key)}
                      disabled={testing === k.id || !k.key}
                      className={BTN}
                    >
                      {testing === k.id ? SPINNER : <I d={ICON.check} className="h-3 w-3" />} Test
                    </button>
                    <button
                      onClick={() => void persistKeys(keys.filter((x) => x.id !== k.id))}
                      className={`${BTN} hover:border-red-400 hover:text-red-500`}
                    >
                      <I d={ICON.trash} className="h-3 w-3" />
                    </button>
                  </div>
                  {tr && (
                    <p
                      className={`mt-1.5 text-[11px] font-semibold ${
                        tr.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                      }`}
                    >
                      {tr.ok ? `✓ Connected — ${tr.label}` : `✗ ${tr.label}`}
                    </p>
                  )}
                  {k.key && !tr && (
                    <p className="mt-1 font-mono text-[10px] text-slate-400">{maskKey(k.key)}</p>
                  )}
                </div>
              );
            })}
            <button onClick={addKey} className={BTN}>
              <I d={ICON.plus} className="h-3 w-3" /> Add key
            </button>
            {savingKeys && <p className="text-[11px] text-slate-400">Saving…</p>}
          </div>
        )}
      </section>
    </>
  );
}
