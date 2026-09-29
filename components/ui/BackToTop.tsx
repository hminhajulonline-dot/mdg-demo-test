"use client";

import { useEffect, useState } from "react";

/**
 * Floating "back to top" button. Appears once the page is scrolled past
 * the fold and smooth-scrolls to the top on click. Positioned clear of
 * the admin panel's mobile bottom nav.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/30 hover:opacity-90 hover:-translate-y-0.5 transition-all"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
      </svg>
    </button>
  );
}
