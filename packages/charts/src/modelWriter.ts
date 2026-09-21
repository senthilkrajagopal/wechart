/**
 * A member's writer, for the places a chart shows its values as names — a
 * category axis, a tooltip heading, a legend entry, a panel title.
 *
 * Only for a member the model says how to write: a time member by its
 * granularity (AC-188), or a member with a format of its own (AC-046, T201).
 * Every other category is shown as it came: run through Cube's plain number,
 * an order id on a category axis read "1,234" (T194).
 */
import { formatterFor, granularityOf, type RenderSpec } from '@wechart/core';

export type Writer = (value: unknown) => string;

export function modelWriter(spec: RenderSpec, member: string | undefined): Writer | undefined {
  if (member === undefined) return undefined;
  const timed = granularityOf(member, spec.granularities ?? {}) !== undefined;
  const declared = spec.formats?.[member] !== undefined;
  if (!timed && !declared) return undefined;
  return formatterFor(member, spec.formats ?? {}, spec.granularities);
}

/** The member's writer, or the value as text. */
export function nameWriter(spec: RenderSpec, member: string | undefined): Writer {
  return modelWriter(spec, member) ?? ((value) => String(value ?? ''));
}
