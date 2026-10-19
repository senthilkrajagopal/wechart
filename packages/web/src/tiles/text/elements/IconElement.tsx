import type { IconRule } from '@wechart/core';

import { StatusIcon, type StateKind } from '../../../shell/StatusIcon';
import { useElementAnswer } from './useElementAnswer';

/** The first rule the value meets, in order (AC-522), or undefined. */
export function ruleFor(
  value: number | undefined,
  rules: readonly IconRule[],
): IconRule | undefined {
  if (value === undefined) return undefined;
  return rules.find((rule) => {
    if (rule.op === 'otherwise') return true;
    const against = rule.value ?? Number.NaN;
    switch (rule.op) {
      case '>=':
        return value >= against;
      case '>':
        return value > against;
      case '<=':
        return value <= against;
      case '<':
        return value < against;
      case '=':
        return value === against;
      default:
        return false;
    }
  });
}

/** Each state's icon, the one the app draws it with everywhere (rule 3). */
const ICONS: Readonly<Record<IconRule['state'], StateKind>> = {
  success: 'ok',
  warning: 'warn',
  error: 'err',
  neutral: 'idle',
};

/**
 * An Icon as read (T886, AC-522; design 21 pin 8, state C3): the first
 * matching rule's status icon and its word, never colour alone; "No rule
 * matched" with a neutral ring, in `text-secondary`, when none matches or
 * there is no data — never nothing.
 */
export function IconText({
  value,
  rules,
}: {
  readonly value: number | undefined;
  readonly rules: readonly IconRule[];
}) {
  const rule = ruleFor(value, rules);
  const state = rule?.state ?? 'neutral';
  return (
    <span className="text-icon" data-tone={state}>
      <StatusIcon kind={ICONS[state]} />
      {rule?.label ?? 'No rule matched'}
    </span>
  );
}

const numberOf = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number)
    ? undefined
    : number;
};

const isRule = (rule: unknown): rule is IconRule =>
  typeof rule === 'object' && rule !== null && 'op' in rule && 'state' in rule && 'label' in rule;

/**
 * An Icon asked of Cube: its measure, or its measure as a share of another
 * (`of`, compared as a ratio: 100% is 1), against its rules.
 */
export function IconElement({
  query,
  member,
  attrs,
  context,
}: {
  readonly query: Readonly<Record<string, unknown>>;
  readonly member: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useElementAnswer(query, context);
  const rules = Array.isArray(attrs['rules']) ? (attrs['rules'] as unknown[]).filter(isRule) : [];
  if (answer.pending)
    return (
      <span className="text-value text-value--waiting" aria-busy="true">
        …
      </span>
    );
  if (answer.error !== undefined)
    return <span className="text-value text-value--unavailable">Unavailable</span>;
  const row = answer.rows[0] ?? {};
  const value = numberOf(row[member]);
  const of = typeof attrs['of'] === 'string' ? numberOf(row[attrs['of']]) : undefined;
  const compared =
    typeof attrs['of'] !== 'string'
      ? value
      : value === undefined || of === undefined || of === 0
        ? undefined
        : value / of;
  return <IconText value={compared} rules={rules} />;
}
