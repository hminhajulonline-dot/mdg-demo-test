import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Email/password admin login. The site stays admin-only: a password that
 * does not belong to an authorized admin is rejected and the fresh session
 * is signed out immediately (Google OAuth remains available alongside).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 200) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const user = data.user;
  const bootstrapEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const isBootstrap = !!bootstrapEmail && (user.email ?? "").toLowerCase() === bootstrapEmail;

  let isAdmin = isBootstrap;
  if (!isAdmin) {
    try {
      const admin = createAdminClient();
      const { data: rows } = await admin
        .from("admin_users")
        .select("status")
        .eq("user_id", user.id)
        .limit(1);
      isAdmin = !!rows?.[0] && rows[0].status === "active";
    } catch {
      // Service role not configured - fail closed.
      isAdmin = false;
    }
  }

  if (!isAdmin) {
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json(
      { error: "This account is not authorized." },
      { status: 403 }
    );
  }

  // Best-effort bootstrap row so the first admin appears in the DB.
  if (isBootstrap) {
    try {
      const admin = createAdminClient();
      await admin.from("admin_users").upsert(
        {
          user_id: user.id,
          email: user.email,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Non-fatal.
    }
  }

  return NextResponse.json({ ok: true });
}
