import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteKeys, trackerKeyStatus } from "@/lib/adobe-tracker/service";

export const runtime = "nodejs";

const LABEL_MAX = 60;
const KEY_MAX = 600;

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Site API key pool for the Adobe Tracker (Apify tokens).
 * Keys are admin-only and never returned to the tool UI - the tool
 * only ever sends the caller's own key from their browser.
 */
export async function GET(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  const url = new URL(request.url);

  // Validate a stored key (id=) or a raw pasted key (key=).
  if (url.searchParams.get("action") === "test") {
    const id = url.searchParams.get("id") || "";
    const raw = url.searchParams.get("key") || "";
    let key = raw.trim();
    if (!key && id) {
      const admin = createAdminClient();
      const { data } = await admin.from("adobe_tracker_keys").select("key").eq("id", id).maybeSingle();
      key = String(data?.key || "");
    }
    if (!key) return NextResponse.json({ ok: false, error: "Missing key." }, { status: 400 });
    const status = await trackerKeyStatus(key);
    return NextResponse.json({ ok: true, status });
  }

  try {
    const keys = await getSiteKeys();
    // Exclude the env fallback row - it is read-only and not editable here.
    return NextResponse.json({
      keys: keys
        .filter((k) => k.id !== "env")
        .map((k) => ({ id: k.id, label: k.label, key: k.key, active: k.active !== false })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load key pool." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const label = cleanText(body.label, LABEL_MAX) || "Site key";
  const key = cleanText(body.key, KEY_MAX);
  if (!key) return NextResponse.json({ error: "Key is required." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("adobe_tracker_keys")
      .insert({ label, key, active: body.active !== false })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add key." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = cleanText(body.id, 80);
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = cleanText(body.label, LABEL_MAX);
  if (body.key !== undefined) {
    const key = cleanText(body.key, KEY_MAX);
    if (!key) return NextResponse.json({ error: "Key cannot be empty." }, { status: 400 });
    patch.key = key;
  }
  if (body.active !== undefined) patch.active = body.active !== false;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("adobe_tracker_keys").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update key." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let id = new URL(request.url).searchParams.get("id") || "";
  if (!id) {
    try {
      const body = await request.json();
      if (typeof body?.id === "string") id = body.id.trim();
    } catch {
      // fall through
    }
  }
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("adobe_tracker_keys").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete key." },
      { status: 500 }
    );
  }
}
