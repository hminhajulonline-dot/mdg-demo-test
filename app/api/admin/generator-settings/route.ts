import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeneratorSettings, GENERATOR_SETTINGS_TAG } from "@/lib/settings";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
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

  const patch: Record<string, unknown> = {};

  const intFields: Array<[string, number, number]> = [
    ["title_length_min", 10, 300],
    ["title_length_max", 20, 300],
    ["description_words_min", 5, 200],
    ["description_words_max", 10, 300],
    ["keywords_count_min", 3, 100],
    ["keywords_count_max", 5, 100],
    ["max_images_per_batch", 1, 200],
    ["rate_limit_per_hour", 0, 100000],
  ];

  for (const [field, min, max] of intFields) {
    if (field in body) {
      const v = toInt(body[field]);
      if (v == null || v < min || v > max) {
        return NextResponse.json(
          { error: `${field} must be a number between ${min} and ${max} (0 = unlimited for rate limit).` },
          { status: 400 }
        );
      }
      patch[field] = v;
    }
  }

  if ("include_category" in body) {
    patch.include_category = Boolean(body.include_category);
  }

  if ("language" in body && typeof body.language === "string") {
    patch.language = body.language.trim().slice(0, 10) || "en";
  }

  if ("custom_prompt" in body && typeof body.custom_prompt === "string") {
    patch.custom_prompt = body.custom_prompt.slice(0, 2000);
  }

  if ("categories" in body) {
    if (!Array.isArray(body.categories)) {
      return NextResponse.json({ error: "categories must be an array." }, { status: 400 });
    }
    const cats = body.categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 50);
    patch.categories = cats;
  }

  // Cross-field sanity checks mirroring the DB constraints.
  const tMin = (patch.title_length_min as number) ?? null;
  const tMax = (patch.title_length_max as number) ?? null;
  if (tMin != null && tMax != null && tMin >= tMax) {
    return NextResponse.json({ error: "Title min must be less than title max." }, { status: 400 });
  }
  const dMin = (patch.description_words_min as number) ?? null;
  const dMax = (patch.description_words_max as number) ?? null;
  if (dMin != null && dMax != null && dMin >= dMax) {
    return NextResponse.json({ error: "Description min must be less than max." }, { status: 400 });
  }
  const kMin = (patch.keywords_count_min as number) ?? null;
  const kMax = (patch.keywords_count_max as number) ?? null;
  if (kMin != null && kMax != null && kMin > kMax) {
    return NextResponse.json({ error: "Keywords min must be less than or equal to max." }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    // Merge with current values then UPSERT - the row gets created if it
    // is missing, and partial updates keep every DB constraint satisfied.
    const current = await getGeneratorSettings();
    const merged = { ...current, ...patch } as Record<string, unknown>;
    delete merged.updated_at;

    const admin = createAdminClient();
    const { error } = await admin.from("generator_settings").upsert({
      id: 1,
      ...merged,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    revalidateTag(GENERATOR_SETTINGS_TAG, "max");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings." },
      { status: 500 }
    );
  }
}
