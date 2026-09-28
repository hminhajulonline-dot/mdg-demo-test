"use client";

import { useEffect } from "react";

export interface ToolToastData {
  msg: string;
  kind: "success" | "error" | "warn";
}

/**
 * Bottom-right status toast shared by the tools (4s auto-hide) -
 * success green, error red, warning amber.
 */
export default function ToolToast({
  toast,
  onDone,
}: {
  toast: ToolToastData | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;

  const tones: Record<ToolToastData["kind"], string> = {
    success:
      "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200",
    error:
      "border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/80 text-red-800 dark:text-red-200",
    warn: "border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200",
  };

  const iconPath: Record<ToolToastData["kind"], string> = {
    success: "M4.5 12.75l6 6 9-13.5",
    error: "M6 18L18 6M6 6l12 12",
    warn: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
  };

  return (
    <div
      role="status"
      className={`fixed bottom-5 right-5 z-50 max-w-xs rounded-xl border px-4 py-3 shadow-lg text-sm flex items-start gap-2 backdrop-blur ${tones[toast.kind]}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-4 w-4 mt-0.5 shrink-0"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath[toast.kind]} />
      </svg>
      <span>{toast.msg}</span>
    </div>
  );
}
