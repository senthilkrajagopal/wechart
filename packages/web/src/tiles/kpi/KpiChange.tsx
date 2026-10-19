import type { KpiDirection, MemberFormats } from '@wechart/core';

import { kindOfFormat } from '../text/elements/shortNumbers';
import { kpiShort } from './kpiNumbers';

/** What a KPI's value is compared with: its value, and the period or measure it is, if named. */
export interface KpiCompared {
  /** Undefined where the compared period has no data (AC-566). */
  readonly value: number | undefined;
  /** "Sep 2026", or another measure's title; a value compared with is named by itself. */
  readonly against?: string;
}

/** Good, bad or neither, by Direction: R80's Change element's tones (rule 3, AC-520). */
function toneOf(delta: number, direction: KpiDirection): 'success' | 'error' | 'neutral' {
  if (direction === 'neutral' || delta === 0) return 'neutral';
  return delta > 0 === (direction === 'higher') ? 'success' : 'error';
}

/** A signed size, with the minus sign rather than a hyphen. */
const signed = (size: number, unit: string) =>
  `${size > 0 ? '+' : size < 0 ? '−' : ''}${Math.abs(size).toFixed(1)}${unit}`;

/**
 * How much it changed: a percentage of what it is compared with, or for a
 * percentage measure the difference in points ("−0.4 pts", design 23 sheet
 * 1); where that was nothing, the amount.
 */
function sizeOf(
  current: number,
  compared: number,
  member: string,
  formats: MemberFormats | undefined,
): string {
  const delta = current - compared;
  if (kindOfFormat(member, formats).kind === 'percent') return signed(delta * 100, ' pts');
  if (compared === 0) {
    return `${delta < 0 ? '−' : '+'}${kpiShort(Math.abs(delta), member, formats)}`;
  }
  return signed((delta / Math.abs(compared)) * 100, '%');
}

/**
 * The change as R80's Change element writes it (AC-565): ▲ or ▼ by which way
 * the value went, then its sign and size ("▲ +4.2%"); "—" for a compared
 * period with no data. The change line's and the table view's (T942).
 */
export function changeTextOf(
  current: number,
  compared: KpiCompared,
  member: string,
  formats: MemberFormats | undefined,
): string {
  if (compared.value === undefined) return '—';
  const delta = current - compared.value;
  const glyph = delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '';
  return `${glyph}${sizeOf(current, compared.value, member, formats)}`;
}

/**
 * The change in words, for a tile's name (T940, AC-567): "up 4.2% vs Sep
 * 2026", "down 0.4 pts vs Sep 2026", or "no data vs Sep 2026".
 */
export function changeWordsOf(
  current: number,
  compared: KpiCompared,
  member: string,
  formats: MemberFormats | undefined,
): string {
  const against = compared.against ?? kpiShort(compared.value ?? 0, member, formats);
  if (compared.value === undefined) return `no data vs ${against}`;
  const delta = current - compared.value;
  const way = delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged';
  const size = sizeOf(current, compared.value, member, formats).replace(/^[+−]/, '');
  return delta === 0 ? `unchanged vs ${against}` : `${way} ${size} vs ${against}`;
}

/**
 * A KPI's change line (T937, AC-565; design 23 sheet 1): R80's Change
 * element — ▲ or ▼ by which way the value went, its sign and size, in the
 * colour Direction gives it — then "vs ‹period› (‹value›)" in `text-xs`
 * `text-secondary`, and "· lower is better" where that is the direction.
 */
export function KpiChange({
  current,
  compared,
  member,
  formats,
  direction,
}: {
  readonly current: number;
  readonly compared: KpiCompared;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  readonly direction: KpiDirection;
}) {
  // A compared period with no data (T939, AC-566): "—", and no change at all.
  if (compared.value === undefined)
    return (
      <p className="kpi__change" data-testid="kpi-change">
        <span className="text-change" data-tone="neutral">
          —
        </span>{' '}
        <span className="kpi__vs">{`vs ${compared.against ?? ''} ·`}</span>{' '}
        <span className="kpi__no-data">No data for the comparison period</span>
      </p>
    );
  const delta = current - compared.value;
  const value = kpiShort(compared.value, member, formats);
  const against = compared.against === undefined ? value : `${compared.against} (${value})`;
  return (
    <p className="kpi__change" data-testid="kpi-change">
      <span className="text-change" data-tone={toneOf(delta, direction)}>
        {changeTextOf(current, compared, member, formats)}
      </span>{' '}
      <span className="kpi__vs">
        {`vs ${against}${direction === 'lower' ? ' · lower is better' : ''}`}
      </span>
    </p>
  );
}
