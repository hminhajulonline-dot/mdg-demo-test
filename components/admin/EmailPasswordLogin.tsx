"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type View = "signin" | "reset" | "forgot";

/** Pull tokens out of a Supabase recovery link hash (#access_token=...&type=recovery). */
function parseRecoveryHash(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token") || "";
  const refreshToken = params.get("refresh_token") || "";
  const type = params.get("type") || "";
  if (!accessToken || !refreshToken) return null;
  if (type && type !== "recovery") return null;
  return { accessToken, refreshToken };
}

export default function EmailPasswordLogin({ next }: { next?: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Recovery link landed on /login? Switch to the set-password form.
  // Supports both flows: PKCE (?code=...) and implicit (#access_token=...).
  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokens = parseRecoveryHash();
        if (!code && !tokens) return;

        // Strip the auth artifacts from the URL BEFORE creating the client,
        // so its built-in auto-detection never races the explicit exchange.
        url.searchParams.delete("code");
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);

        const supabase = createClient();
        if (tokens) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          if (sessErr) throw sessErr;
        } else if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
        }
        setView("reset");
        setError(null);
        setNotice("Recovery link verified - choose a new password.");
      } catch {
        setError("This recovery link is invalid or has expired. Request a new one.");
      }
    })();
  }, []);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Login failed (${res.status})`);
      // Never route back to /login itself (avoids the post-login bounce).
      const target =
        next && next.startsWith("/") && !next.startsWith("/login") ? next : "/";
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setLoading(false);
    }
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (!email.trim()) throw new Error("Enter your email first, then request the link.");
      const supabase = createClient();
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (resetErr) throw resetErr;
      setNotice("If that email exists, a password reset link is on its way. Check your inbox.");
      setView("signin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      const supabase = createClient();
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      await supabase.auth.signOut().catch(() => undefined);
      setView("signin");
      setPassword("");
      setConfirm("");
      setNotice("Password updated - sign in with your new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setLoading(false);
    }
  }

  if (view === "reset") {
    return (
      <form onSubmit={submitNewPassword} className="mt-6 space-y-3 text-left">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Choose a new password for your admin account.
        </p>
        <div>
          <label
            htmlFor="reset-password"
            className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
          >
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </div>
        <div>
          <label
            htmlFor="reset-confirm"
            className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
          >
            Confirm password
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat the password"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm px-3 py-2">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
        <button
          type="button"
          onClick={() => {
            setView("signin");
            setError(null);
            setNotice(null);
          }}
          className="w-full text-center text-xs font-semibold text-brand hover:underline"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  if (view === "forgot") {
    return (
      <form onSubmit={sendReset} className="mt-6 space-y-3 text-left">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Enter your admin email and we&apos;ll send a link to set a new password.
        </p>
        <div>
          <label
            htmlFor="forgot-email"
            className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
          >
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
        <button
          type="button"
          onClick={() => {
            setView("signin");
            setError(null);
          }}
          className="w-full text-center text-xs font-semibold text-brand hover:underline"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={signIn} className="mt-6 space-y-3 text-left">
      <div>
        <label
          htmlFor="login-email"
          className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
        >
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
      </div>
      <div>
        <label
          htmlFor="login-password"
          className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
        >
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm px-3 py-2">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Signing in…
          </span>
        ) : (
          "Sign in"
        )}
      </button>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setView("forgot");
            setError(null);
            setNotice(null);
          }}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Forgot password?
        </button>
      </div>
    </form>
  );
}
