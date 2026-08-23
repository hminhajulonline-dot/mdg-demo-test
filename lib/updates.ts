import updatesJson from "../updates.json";

export type UpdateType = "release" | "feature" | "bugfix" | "docs";

export interface SiteUpdate {
  version: string;
  date: string;
  type: UpdateType;
  title: string;
  changes: string[];
  bugfixes: string[];
  migrationRequired: boolean;
  migrations: string[];
  action: string | null;
}

const RAW = (updatesJson as { updates?: unknown }).updates;

export const UPDATES: SiteUpdate[] = Array.isArray(RAW)
  ? (RAW as SiteUpdate[])
      .slice()
      .sort((a, b) => compareVersions(b.version, a.version))
  : [];

export const LATEST_UPDATE: SiteUpdate | null = UPDATES[0] ?? null;

/** Updates that arrived after the given version string. */
export function updatesSince(version: string): SiteUpdate[] {
  return UPDATES.filter((u) => compareVersions(u.version, version) > 0);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
