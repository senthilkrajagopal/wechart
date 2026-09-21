/**
 * A time member's writer, for the places a chart shows its values as names —
 * a category axis, a tooltip heading, a legend entry, a panel title (AC-188).
 *
 * Only for a time member. Every other category is shown as it came: run
 * through the member's number formatter, an order id on a category axis read
 * "1,234" (T194).
 */
import { formatterFor, type RenderSpec } from '@wechart/core';

export type Writer = (value: unknown) => string;

export function timeWriter(spec: RenderSpec, member: string | undefined): Writer | undefined {
  if (member === undefined || spec.granularities?.[member] === undefined) return undefined;
  return formatterFor(member, spec.formats ?? {}, spec.granularities);
}

/** The member's time writer, or the value as text. */
export function nameWriter(spec: RenderSpec, member: string | undefined): Writer {
  return timeWriter(spec, member) ?? ((value) => String(value ?? ''));
}
