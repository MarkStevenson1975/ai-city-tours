// Shared key for a cold-outreach demo prospect. Keyed by the org from Louise's
// personalised /try link when present (that is the unique prospect), otherwise
// by the town, so an "open" and a later "build" collapse to one lead.
export function demoDedupeKey(org: string | null, area: string | null): string | null {
  const o = (org ?? '').trim().toLowerCase();
  if (o) return `org:${o}`;
  const a = (area ?? '').trim().toLowerCase();
  if (a) return `area:${a}`;
  return null;
}
