"use client";

import { useEffect, useState } from "react";

interface MasterPrompt {
  id: string;
  title: string;
  description: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const SPINNER = (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ICON = {
  plus: "M12 4.5v15m7.5-7.5h-15",
  x: "M6 18L18 6M6 6l12 12",
  check: "M4.5 12.75l6 6 9-13.5",
  trash:
    "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.31 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  edit: "M16.862 4.487 18.549 2.8a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10",
  save: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
  sparkles:
    "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z",
};

const I = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const EMPTY_FORM = { title: "", description: "", systemPrompt: "", isActive: true };

export default function MasterPromptsManager() {
  const [prompts, setPrompts] = useState<MasterPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadTick, setLoadTick] = useState(0);
  const [editing, setEditing] = useState<string | null>(null); // "new" | id | null
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = () => setLoadTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/master-prompts");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Load failed.");
        if (!cancelled) setPrompts(json.prompts || []);
      } catch (err) {
        if (!cancelled) {
          setMessage({ ok: false, text: err instanceof Error ? err.message : "Load failed." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTick]);

  function handleNew() {
    setEditing("new");
    setForm({ ...EMPTY_FORM });
    setMessage(null);
  }

  function handleEdit(mp: MasterPrompt) {
    setEditing(mp.id);
    setForm({
      title: mp.title,
      description: mp.description,
      systemPrompt: mp.system_prompt,
      isActive: mp.is_active !== false,
    });
    setMessage(null);
  }

  function handleCancel() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  }

  async function handleSave() {
    if (!form.title.trim() || !form.systemPrompt.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const url = "/api/admin/master-prompts";
      const res = await fetch(url, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing === "new"
            ? {
                title: form.title,
                description: form.description,
                systemPrompt: form.systemPrompt,
                isActive: form.isActive,
              }
            : { id: editing, ...form },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      handleCancel();
      setMessage({ ok: true, text: "Saved." });
      reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this master prompt?")) return;
    try {
      const res = await fetch(`/api/admin/master-prompts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Delete failed.");
      if (editing === id) handleCancel();
      reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Delete failed." });
    }
  }

  async function handleToggleActive(mp: MasterPrompt) {
    try {
      const res = await fetch("/api/admin/master-prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mp.id, isActive: mp.is_active === false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Update failed.");
      reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Update failed." });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        {SPINNER}
        Loading master prompts…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Interactive prompt templates the Auto Engine walks users through.
        </p>
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90"
        >
          <I d={ICON.plus} className="h-3 w-3" /> Add Master Prompt
        </button>
      </div>

      {message ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            message.ok
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {editing ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">
              {editing === "new" ? "New Master Prompt" : "Edit Master Prompt"}
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
            >
              <I d={ICON.x} className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title (e.g., Halloween Object Bundle)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900/50"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Short description for users"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900/50"
          />
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="System prompt (the master prompt that guides the AI)"
            rows={12}
            className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900/50"
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="accent-brand"
            />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Active (visible to the tool)
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.systemPrompt.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {saving ? SPINNER : <I d={ICON.save} className="h-3 w-3" />}
              {editing === "new" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {prompts.map((mp) => (
          <div
            key={mp.id}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-surface p-3 dark:border-slate-800"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <I d={ICON.sparkles} className="h-3 w-3 shrink-0 text-brand" />
                <span className="truncate text-xs font-bold">{mp.title}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    mp.is_active !== false
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  {mp.is_active !== false ? "Active" : "Inactive"}
                </span>
              </div>
              {mp.description ? (
                <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{mp.description}</p>
              ) : null}
              <p className="mt-1 line-clamp-2 font-mono text-[10px] text-slate-400">
                {(mp.system_prompt || "").substring(0, 120)}…
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => handleToggleActive(mp)}
                className={`rounded-lg p-1.5 transition-colors ${
                  mp.is_active !== false
                    ? "text-brand hover:bg-brand/10"
                    : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                title={mp.is_active !== false ? "Deactivate" : "Activate"}
              >
                <I d={mp.is_active !== false ? ICON.check : ICON.x} className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleEdit(mp)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-brand/10 hover:text-brand"
                title="Edit"
              >
                <I d={ICON.edit} className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(mp.id)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                title="Delete"
              >
                <I d={ICON.trash} className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        {!prompts.length ? (
          <div className="py-8 text-center text-[11px] text-slate-400">
            No master prompts yet. Click &quot;Add Master Prompt&quot; to create one.
          </div>
        ) : null}
      </div>
    </div>
  );
}
