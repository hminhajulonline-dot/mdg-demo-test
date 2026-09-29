import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteSettings, SITE_SETTINGS_TAG } from "@/lib/settings";
import { ALL_PROVIDER_IDS } from "@/lib/types";

const HEX = /^#[0-9a-fA-F]{6}$/;

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

  const textFields = [
    "site_name",
    "site_description",
    "footer_text",
    "hero_badge",
    "hero_title",
    "hero_subtitle",
  ] as const;
  for (const f of textFields) {
    if (typeof body[f] === "string") {
      const v = (body[f] as string).trim().slice(0, f === "site_name" ? 100 : 400);
      if (!v && f === "site_name") {
        return NextResponse.json({ error: "Site name cannot be empty." }, { status: 400 });
      }
      patch[f] = v;
    }
  }

  // Long-form about page content (paragraphs separated by blank lines).
  const longFields = ["about_title", "about_body"] as const;
  for (const f of longFields) {
    if (typeof body[f] === "string") {
      patch[f] = (body[f] as string).slice(0, 5000);
    }
  }

  // Enabled AI providers.
  if ("enabled_providers" in body) {
    if (!Array.isArray(body.enabled_providers)) {
      return NextResponse.json({ error: "enabled_providers must be a list." }, { status: 400 });
    }
    const ids = body.enabled_providers
      .map((v) => String(v).trim())
      .filter((id) => ALL_PROVIDER_IDS.includes(id));
    patch.enabled_providers = ids;
  }

  // Repeater blocks (features / steps).
  for (const key of ["features", "steps"] as const) {
    if (key in body) {
      const arr = body[key];
      if (!Array.isArray(arr)) {
        return NextResponse.json({ error: `${key} must be a list.` }, { status: 400 });
      }
      const blocks = arr
        .slice(0, 8)
        .map((b) => ({
          title: String(b?.title ?? "").trim().slice(0, 80),
          body: String(b?.body ?? "").trim().slice(0, 400),
        }))
        .filter((b) => b.title || b.body);
      patch[key] = blocks;
    }
  }

  for (const f of ["logo_url", "favicon_url"] as const) {
    if (f in body) patch[f] = typeof body[f] === "string" ? (body[f] as string).trim() : null;
  }

  if (typeof body.primary_color === "string") {
    if (!HEX.test(body.primary_color)) {
      return NextResponse.json({ error: "Primary color must be a HEX value like #16A34A." }, { status: 400 });
    }
    patch.primary_color = body.primary_color;
  }
  if (typeof body.secondary_color === "string") {
    if (!HEX.test(body.secondary_color)) {
      return NextResponse.json({ error: "Secondary color must be a HEX value like #0F172A." }, { status: 400 });
    }
    patch.secondary_color = body.secondary_color;
  }

  if ("theme_mode" in body) {
    if (!["light", "dark", "system"].includes(String(body.theme_mode))) {
      return NextResponse.json({ error: "Invalid theme mode." }, { status: 400 });
    }
    patch.theme_mode = String(body.theme_mode);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    // Merge with the existing row so partial updates don't blank other
    // fields, then UPSERT - if the row is missing (migrations not run yet)
    // it is created instead of silently updating zero rows.
    const current = await getSiteSettings();
    const merged = { ...current, ...patch } as Record<string, unknown>;
    delete merged.updated_at;

    const admin = createAdminClient();
    const { error } = await admin.from("site_settings").upsert({
      id: 1,
      ...merged,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    revalidateTag(SITE_SETTINGS_TAG, "max");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings." },
      { status: 500 }
    );
  }
}
