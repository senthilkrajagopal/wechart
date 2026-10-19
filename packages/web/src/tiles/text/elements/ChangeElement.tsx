import { formatValue, type MemberFormats } from '@wechart/core';

import { changeOf, type Change } from '../elementQueries';
import { ElementSkeleton, ElementUnavailable } from '../ElementState';
import { kindOfFormat } from './shortNumbers';
import { useElementAnswer } from './useElementAnswer';

export type Direction = 'higher' | 'lower' | 'neutral';

/** Which status a change is in, by its direction setting (rule 3, AC-520). */
function toneOf(delta: number, direction: Direction): 'success' | 'error' | 'neutral' {
  if (direction === 'neutral' || delta === 0) return 'neutral';
  const rose = delta > 0;
  return rose === (direction === 'higher') ? 'success' : 'error';
}

/**
 * An amount, shortened as a headline number is ("$50K"), in its measure's
 * kind of format: money as money, a percentage as its model writes it, any
 * other number in short (decision T884-1).
 */
function amountOf(amount: number, member: string, formats: MemberFormats | undefined): string {
  const kind = kindOfFormat(member, formats);
  if (kind.kind === 'percent') return formatValue(amount, member, formats);
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    ...(kind.kind === 'money' ? { style: 'currency', currency: kind.currency } : {}),
  }).format(amount);
}

/**
 * A Change as read (T884, AC-520; design 21 pin 8, state C1): ▲ or ▼ — its
 * sign, so it reads without colour — then the change as a percentage or an
 * amount, in `status-success` or `status-error` by its direction setting, or
 * `text-secondary` when Neutral. "—" with nothing to compare.
 */
export function ChangeText({
  change,
  member,
  formats,
  show = 'percent',
  direction = 'higher',
}: {
  readonly change: Change | undefined;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  readonly show?: 'percent' | 'amount';
  readonly direction?: Direction;
}) {
  const words = changeWordsOf(change, member, formats, show);
  if (change === undefined || words === undefined)
    return (
      <span className="text-change" data-tone="neutral">
        —
      </span>
    );
  return (
    <span className="text-change" data-tone={toneOf(change.delta, direction)}>
      {words}
    </span>
  );
}

/** A change in words, "▲ 4.2%" or "▼ $50K", or undefined with nothing to compare. */
function changeWordsOf(
  change: Change | undefined,
  member: string,
  formats: MemberFormats | undefined,
  show: 'percent' | 'amount',
): string | undefined {
  const size =
    change === undefined
      ? undefined
      : show === 'amount'
        ? amountOf(Math.abs(change.delta), member, formats)
        : change.ratio === undefined
          ? undefined
          : `${Math.abs(change.ratio * 100).toFixed(1)}%`;
  if (change === undefined || size === undefined) return undefined;
  const sign = change.delta > 0 ? '▲ ' : change.delta < 0 ? '▼ ' : '';
  return `${sign}${size}`;
}

const DIRECTIONS: readonly Direction[] = ['higher', 'lower', 'neutral'];

/** A Change asked of Cube: loading, failed, or its change (design 21 G1–G3). */
export function ChangeElement({
  query,
  member,
  title,
  attrs,
  formats,
  context,
}: {
  /** Its query, or undefined where its measure has no time dimension to compare along. */
  readonly query: Readonly<Record<string, unknown>> | undefined;
  readonly member: string;
  /** Its measure's title, for an error's Details (AC-525). */
  readonly title?: string | undefined;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly formats?: MemberFormats | undefined;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useElementAnswer(query, context);
  if (query === undefined) return <ChangeText change={undefined} member={member} />;
  // Its states (T889, AC-525).
  if (answer.pending) return <ElementSkeleton />;
  if (answer.error !== undefined)
    return <ElementUnavailable measure={title ?? member} error={answer.error} />;
  const show = attrs['show'] === 'amount' ? 'amount' : 'percent';
  if (answer.busy)
    return (
      <ElementSkeleton
        width={changeWordsOf(changeOf(answer.rows, member), member, formats, show)?.length}
      />
    );
  const direction = DIRECTIONS.find((one) => one === attrs['direction']) ?? 'higher';
  return (
    <ChangeText
      change={changeOf(answer.rows, member)}
      member={member}
      formats={formats}
      show={show}
      direction={direction}
    />
  );
}
