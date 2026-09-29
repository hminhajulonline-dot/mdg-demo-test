"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Phase = "idle" | "run" | "done";

/**
 * Thin animated bar pinned to the top of the window during navigation.
 * It starts the moment an internal link is clicked (covering the
 * middleware roundtrip before any HTML streams) and fades out once the
 * new route's loading boundary/page commits. Paired with the route
 * loading.tsx spinners.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const failSafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const finish = () => {
    if (phaseRef.current !== "run") return;
    setPhaseBoth("done");
    if (failSafeRef.current) clearTimeout(failSafeRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    fadeRef.current = setTimeout(() => setPhaseBoth("idle"), 450);
  };

  const start = () => {
    if (phaseRef.current === "run") return;
    setPhaseBoth("run");
    if (failSafeRef.current) clearTimeout(failSafeRef.current);
    // Never get stuck if a navigation fails or is swallowed.
    failSafeRef.current = setTimeout(() => {
      if (phaseRef.current === "run") finish();
    }, 10_000);
  };

  // Instant feedback on link clicks / Back-Forward, before the server
  // has produced a single byte of the next page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target instanceof Element ? e.target.closest("a") : null;
      if (!el) return;
      const href = el.getAttribute("href") || "";
      if (!href.startsWith("/") || el.hasAttribute("download")) return;
      if ((el as HTMLAnchorElement).target === "_blank") return;
      try {
        const url = new URL(href, window.location.href);
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      start();
    };
    const onPop = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      if (failSafeRef.current) clearTimeout(failSafeRef.current);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation committed -> complete the bar and fade it away.
  useEffect(() => {
    if (phaseRef.current === "run") finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (phase === "idle") return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      {phase === "run" ? (
        <div className="h-full w-full overflow-hidden bg-brand/15">
          <div className="h-full w-2/5 bg-brand animate-[route-bar_0.9s_ease-in-out_infinite]" />
        </div>
      ) : (
        <div className="h-full w-full bg-brand animate-[route-bar-out_0.4s_ease-out_forwards]" />
      )}
    </div>
  );
}
