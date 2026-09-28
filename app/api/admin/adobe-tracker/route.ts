import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { DEFAULT_TRACKER_SETTINGS, type TrackerSettings } from "@/lib/adobe-tracker/types";
import { getTrackerSettings, saveTrackerSettings } from "@/lib/adobe-tracker/service";

export const runtime = "nodejs";

const TEXT_MAX = 2000;

function cleanPatch(body: Record<string, unknown>): Partial<TrackerSettings> {
  const patch: Partial<TrackerSettings> = {};
  const num = (v: unknown, min: number, max: number): number | null => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  const text = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  if (body.enabled !== undefined) patch.enabled = body.enabled !== false;
  if (body.dailySearches !== undefined) {
    const n = num(body.dailySearches, -1, 100_000);
    if (n !== null) patch.dailySearches = n;
  }
  if (body.resultsPerSearch !== undefined) {
    const n = num(body.resultsPerSearch, 1, 50);
    if (n !== null) patch.resultsPerSearch = n;
  }
  if (body.contributorEnabled !== undefined) patch.contributorEnabled = body.contributorEnabled !== false;
  if (body.apiSource !== undefined && ["auto", "admin", "user"].includes(String(body.apiSource))) {
    patch.apiSource = body.apiSource as TrackerSettings["apiSource"];
  }
  if (body.byoEnabled !== undefined) patch.byoEnabled = body.byoEnabled !== false;
  if (body.apiPanelEnabled !== undefined) patch.apiPanelEnabled = body.apiPanelEnabled !== false;
  if (body.byoTitle !== undefined) patch.byoTitle = text(body.byoTitle, 200) || DEFAULT_TRACKER_SETTINGS.byoTitle;
  if (body.byoMessage !== undefined) patch.byoMessage = text(body.byoMessage, 1000) || DEFAULT_TRACKER_SETTINGS.byoMessage;
  if (body.byoGuide !== undefined) patch.byoGuide = text(body.byoGuide, TEXT_MAX) || DEFAULT_TRACKER_SETTINGS.byoGuide;
  if (body.byoGuideUrl !== undefined) patch.byoGuideUrl = text(body.byoGuideUrl, 500);
  return patch;
}

export async function GET() {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  try {
    return NextResponse.json({ settings: await getTrackerSettings() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Adobe Tracker settings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await saveTrackerSettings(cleanPatch(body));
    return NextResponse.json({ ok: true, settings: await getTrackerSettings() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save Adobe Tracker settings." },
      { status: 500 }
    );
  }
}
