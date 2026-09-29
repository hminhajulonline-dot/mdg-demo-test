/**
 * Full-page loading spinner used by the route loading.tsx boundaries.
 * Renders a brand-colored ring so navigation feedback feels instant
 * while the server renders the next page.
 */
export default function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <span className="block h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          {label}
        </span>
      </div>
    </div>
  );
}
