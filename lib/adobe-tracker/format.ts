/**
 * Display formatters shared by the Adobe Tracker tool UI.
 * Ported from CSV Tree's adobeTrackerService.js (client-side helpers).
 */

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// "27 days ago" / "3 years ago" style relative age from a date string.
export function ageFromDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const t = new Date(String(dateStr).replace(" ", "T")).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return m === 1 ? "1 month ago" : `${m} months ago`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "20 Jun 2023" style display date.
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(String(dateStr).replace(" ", "T"));
  if (!Number.isFinite(d.getTime())) return String(dateStr).slice(0, 10) || "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
