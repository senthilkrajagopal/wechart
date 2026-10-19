import { markingsFrom } from '@wechart/core';

import type { DashboardDocument } from '../model/document';
import { interactionsOf } from './interactionMode';

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

/**
 * What the settings page has changed, one entry per setting that differs
 * from the saved dashboard, in the page's order: for the bar's "· 1 unsaved
 * change" and the discard question's "You changed the interaction mode."
 * (T685; design 05 pin 1 and state C; the coordinator's call, 2026-10-17,
 * overturnable).
 *
 * The mode, cross-filtering and the markings are compared as in effect, so
 * defaults written out are no change, and the page asks before leaving
 * exactly when this names something. Anything else that differs is "the
 * settings", so a change never goes unasked about.
 */
export function changesOf(saved: DashboardDocument, draft: DashboardDocument): string[] {
  const before = interactionsOf(saved.settings);
  const after = interactionsOf(draft.settings);
  const changed: [string, boolean][] = [
    ['the name', saved.title !== draft.title],
    ['the folder', saved.folderId !== draft.folderId],
    ['the description', saved.description !== draft.description],
    ['the interaction mode', before.mode !== after.mode],
    ['the markings', !same(markingsFrom(saved.markings), markingsFrom(draft.markings))],
    ['the tiles’ markings', !same(saved.pages, draft.pages)],
    ['cross-filtering', !same(before.crossFilter, after.crossFilter)],
    ['the parameters', !same(saved.parameters ?? [], draft.parameters ?? [])],
    ['the page width', saved.settings.width !== draft.settings.width],
  ];
  const named = changed.filter(([, differs]) => differs).map(([name]) => name);
  return !same(rest(saved), rest(draft)) ? [...named, 'the settings'] : named;
}

/**
 * The dashboard less what `changesOf` names one by one: any setting it
 * doesn't name stays in, so a new one is still asked about (T685's review).
 */
function rest(document: DashboardDocument): Record<string, unknown> {
  const { title, folderId, description, settings, markings, pages, parameters, ...others } =
    document;
  void [title, folderId, description, markings, pages, parameters];
  const { width, interactions, ...otherSettings } = settings;
  void [width, interactions];
  return { ...others, settings: otherSettings };
}

/**
 * The discard question's sentence (design 05 state C): "You changed the
 * interaction mode.", two joined by "and", more by commas with "and" before
 * the last.
 */
export function changedSentence(changes: readonly string[]): string {
  const last = changes.at(-1);
  if (last === undefined) return '';
  const rest = changes.slice(0, -1);
  return `You changed ${rest.length === 0 ? last : `${rest.join(', ')} and ${last}`}.`;
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
