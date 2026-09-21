import type { DashboardDocument } from '../model/document';

/**
 * Whether the settings page is holding changes that have not been saved
 * (AC-073).
 *
 * By content, not by identity. The page rebuilds its draft on every keystroke,
 * so identity would call a page dirty the moment anyone touched a field and
 * stay that way even after they put it back — and a guard that asks "discard
 * your changes?" about a dashboard that is exactly as it was is a guard people
 * learn to click through. That is how it stops protecting anything.
 *
 * Written out rather than compared as JSON strings, because serialisation is
 * sensitive to key order and a dashboard is the same dashboard whichever order
 * its keys were built in.
 */
export function isDirty(saved: DashboardDocument, draft: DashboardDocument): boolean {
  return !same(saved, draft);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => same(item, b[index]));
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  // Undefined values are absences, not differences: a draft that carries
  // `markings: undefined` is the same dashboard as one that never had the key.
  const keys = (value: Record<string, unknown>) =>
    Object.keys(value).filter((key) => value[key] !== undefined);

  const ours = keys(left);
  const theirs = keys(right);
  if (ours.length !== theirs.length) return false;

  return ours.every((key) => theirs.includes(key) && same(left[key], right[key]));
}
