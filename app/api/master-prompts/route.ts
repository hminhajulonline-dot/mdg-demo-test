import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Active master prompts for the Auto Engine tool (system prompts included -
 * the whole site is admin-only and every route is guarded).
 */
export async function GET() {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("master_prompts")
      .select("id, title, description, system_prompt, is_active, created_at, updated_at")
      .eq("is_active", true)
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
