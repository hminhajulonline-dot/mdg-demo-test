import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TITLE_MAX = 120;
const DESC_MAX = 500;
const PROMPT_MAX = 20_000;

function cleanBody(
  body: Record<string, unknown>,
  partial: boolean
): { error?: string; patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};

  if (body.title !== undefined || !partial) {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
    if (!title) return { error: "Title is required.", patch: {} };
    patch.title = title;
  }
  if (body.systemPrompt !== undefined || !partial) {
    const sp = typeof body.systemPrompt === "string" ? body.systemPrompt.trim().slice(0, PROMPT_MAX) : "";
    if (!sp) return { error: "System prompt is required.", patch: {} };
    patch.system_prompt = sp;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" ? body.description.trim().slice(0, DESC_MAX) : "";
  }
  if (body.isActive !== undefined) patch.is_active = body.isActive !== false;
  if (body.createdBy !== undefined) {
    patch.created_by = typeof body.createdBy === "string" ? body.createdBy.trim().slice(0, 200) : null;
  }
  return { patch };
}

export async function GET() {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("master_prompts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ prompts: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load master prompts." },
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

  const { patch, error } = cleanBody(body, false);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (patch.description === undefined) patch.description = "";
  if (patch.is_active === undefined) patch.is_active = true;

  try {
    const admin = createAdminClient();
    const { data, error: dbError } = await admin
      .from("master_prompts")
      .insert(patch)
      .select("id")
      .single();
    if (dbError) throw dbError;
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create master prompt." },
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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { patch, error } = cleanBody(body, true);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  try {
    const admin = createAdminClient();
    const { error: dbError } = await admin.from("master_prompts").update(patch).eq("id", id);
    if (dbError) throw dbError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update master prompt." },
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
    const { error } = await admin.from("master_prompts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete master prompt." },
      { status: 500 }
    );
  }
}
