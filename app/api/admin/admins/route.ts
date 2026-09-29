import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_USERS_TAG } from "@/lib/auth";

export const runtime = "nodejs";

interface AdminRow {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
}

/** List all admin rows. */
export async function GET() {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ admins: (data ?? []) as AdminRow[] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load admins." },
      { status: 500 }
    );
  }
}

/** Promote an existing authenticated Google account by email. */
export async function POST(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // The account must have signed in at least once so its auth user exists.
    const { data: page, error: listError } = await admin.auth.admin.listUsers({
      perPage: 500,
      page: 1,
    });
    if (listError) throw listError;
    const user = (page?.users ?? []).find(
      (u) => (u.email || "").toLowerCase() === email
    );
    if (!user) {
      return NextResponse.json(
        {
          error:
            "No signed-in account found with that email. Ask the person to log in via Google once, then add them here.",
        },
        { status: 404 }
      );
    }

    const { error } = await admin.from("admin_users").upsert(
      {
        user_id: user.id,
        email,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
    revalidateTag(ADMIN_USERS_TAG, "max");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add admin." },
      { status: 500 }
    );
  }
}

/** Enable / disable an admin row. */
export async function PATCH(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = (body.id || "").trim();
  const status = body.status === "active" ? "active" : body.status === "disabled" ? "disabled" : "";
  if (!id || !status) {
    return NextResponse.json({ error: "id and a valid status are required." }, { status: 400 });
  }

  // Safety net: never lock yourself out of the last active admin.
  try {
    const admin = createAdminClient();
    const { data: current } = await admin
      .from("admin_users")
      .select("user_id, status");
    const activeOthers = (current ?? []).filter(
      (r) => r.user_id !== id && r.status === "active"
    );
    if (status === "disabled" && activeOthers.length === 0) {
      return NextResponse.json(
        { error: "Cannot disable the only active admin. Add another admin first." },
        { status: 400 }
      );
    }

    const { error } = await admin
      .from("admin_users")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    revalidateTag(ADMIN_USERS_TAG, "max");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update admin." },
      { status: 500 }
    );
  }
}

/** Remove an admin row entirely. */
export async function DELETE(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: current } = await admin.from("admin_users").select("id, status");
    const othersActive = (current ?? []).filter((r) => r.id !== id && r.status === "active");
    if (othersActive.length === 0) {
      return NextResponse.json(
        { error: "Cannot remove the only active admin. Add another admin first." },
        { status: 400 }
      );
    }
    const { error } = await admin.from("admin_users").delete().eq("id", id);
    if (error) throw error;
    revalidateTag(ADMIN_USERS_TAG, "max");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove admin." },
      { status: 500 }
    );
  }
}
