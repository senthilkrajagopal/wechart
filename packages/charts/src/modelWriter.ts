/**
 * A member's writer, for the places a chart shows its values as names — a
 * category axis, a tooltip heading, a legend entry, a panel title.
 *
 * Only for a member the model says how to write: a time member by its
 * granularity (AC-188), or a member with a format of its own (AC-046, T201).
 * Every other category is shown as it came: run through Cube's plain number,
 * an order id on a category axis read "1,234" (T194).
 */
import { formatterFor, granularityOf, rewritesValues, type RenderSpec } from '@wechart/core';

export type Writer = (value: unknown) => string;

export function modelWriter(spec: RenderSpec, member: string | undefined): Writer | undefined {
  if (member === undefined) return undefined;
  const timed = granularityOf(member, spec.granularities ?? {}) !== undefined;
  // A format that writes values differently — not an id, a link or an image
  // address, which are written as they came (T201's review).
  const declared = rewritesValues(spec.formats?.[member]);
  if (!timed && !declared) return undefined;
  return formatterFor(member, spec.formats ?? {}, spec.granularities);
}

/** The member's writer, or the value as text. */
export function nameWriter(spec: RenderSpec, member: string | undefined): Writer {
  return modelWriter(spec, member) ?? ((value) => String(value ?? ''));
}

/**
 * How a series is named where a reader sees it (AC-220): by its split
 * member's value, written as the model says; or — a series per measure, with
 * nothing to split by — by the measure's title, never "orders.count".
 */
export function seriesWriter(spec: RenderSpec, splitBy: string | undefined): Writer {
  if (splitBy !== undefined) return nameWriter(spec, splitBy);
  return (value) => titleOf(spec, String(value ?? ''));
}

/**
 * A member's title from the model (AC-220), or its name where the model
 * gives none — by the titles' own keys, so a name such as "constructor" is
 * never answered with something every object inherits.
 */
export function titleOf(spec: Pick<RenderSpec, 'titles'>, name: string): string {
  const titles = spec.titles;
  return titles !== undefined && Object.hasOwn(titles, name) ? (titles[name] ?? name) : name;
}
