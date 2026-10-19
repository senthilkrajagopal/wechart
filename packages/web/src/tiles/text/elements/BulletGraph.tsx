import { formatValue, type MemberFormats } from '@wechart/core';

import { useElementAnswer } from './useElementAnswer';

/** 96 × 16: six of a word's height wide (direction §7h). */
const WORD_WIDTH = 96;
const WORD_HEIGHT = 16;
/** The ranges' greys, low to high (§5 roles). */
const GREYS = ['var(--wc-bg-subtle)', 'var(--wc-border-subtle)', 'var(--wc-border-strong)'];

/** The most ranges a bullet graph holds (AC-521). */
export const MOST_RANGES = 3;

/** Why these ranges can't be a bullet graph's, or undefined (AC-521). */
export function rangesProblem(ranges: readonly number[]): string | undefined {
  if (ranges.length > MOST_RANGES) return 'A bullet graph holds up to 3 ranges.';
  if (ranges.some((range, at) => at > 0 && (ranges[at - 1] ?? range) >= range))
    return 'Ranges go from low to high.';
  return undefined;
}

/** "15%, 20% and 25%". */
function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/**
 * A Bullet graph (T885, AC-521; design 21 pin 9, state C4): wechart's own
 * SVG, 96 × 16, up to 3 ranges low to high in `bg-subtle`, `border-subtle`
 * and `border-strong`, its value a 4 px bar and its target a 2 px rule, both
 * `text-primary`, between a minimum and a maximum — the largest of value,
 * target and ranges unless set. An `img` whose text names the value, the
 * target and the ranges.
 */
export function BulletGraphSvg({
  value,
  target,
  ranges = [],
  min = 0,
  max,
  title,
  member,
  formats,
  width: WIDTH = WORD_WIDTH,
  height: HEIGHT = WORD_HEIGHT,
}: {
  /** Its size where it isn't a word's: a KPI's target, the content width × 16 (T938). */
  readonly width?: number;
  readonly height?: number;
  readonly value: number;
  readonly target?: number | undefined;
  readonly ranges?: readonly number[];
  readonly min?: number;
  readonly max?: number | undefined;
  readonly title: string;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
}) {
  const drawn = ranges.slice(0, MOST_RANGES);
  const top = max ?? Math.max(value, target ?? value, ...drawn);
  const span = top - min;
  const x = (at: number) =>
    span <= 0 ? 0 : Math.max(0, Math.min(WIDTH, ((at - min) / span) * WIDTH));
  const written = (at: number) => formatValue(at, member, formats);
  const label = [
    `${title} ${written(value)}`,
    ...(target === undefined ? [] : [`target ${written(target)}`]),
    ...(drawn.length === 0 ? [] : [`ranges ${listOf(drawn.map(written))}`]),
  ].join(', ');
  return (
    <svg
      className="text-bullet"
      role="img"
      aria-label={label}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
    >
      {drawn.map((range, at) => {
        const from = x(at === 0 ? min : (drawn[at - 1] ?? min));
        return (
          <rect
            // Ranges are kept low to high, one per place.
            key={`range-${String(at)}`}
            data-part="range"
            x={from}
            y={0}
            width={Math.max(0, x(range) - from)}
            height={HEIGHT}
            style={{ fill: GREYS[at] }}
          />
        );
      })}
      <rect
        data-part="value"
        x={0}
        y={(HEIGHT - 4) / 2}
        width={x(value)}
        height={4}
        style={{ fill: 'var(--wc-text-primary)' }}
      />
      {target === undefined ? null : (
        <rect
          data-part="target"
          x={Math.max(0, Math.min(WIDTH - 2, x(target) - 1))}
          y={0}
          width={2}
          height={HEIGHT}
          style={{ fill: 'var(--wc-text-primary)' }}
        />
      )}
    </svg>
  );
}

const numberOf = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : Number(value);
  return value === null || value === undefined || !Number.isFinite(number) ? undefined : number;
};

/** A Bullet graph asked of Cube: its value, and its target where that is a measure. */
export function BulletGraphElement({
  query,
  title,
  member,
  attrs,
  formats,
  context,
}: {
  readonly query: Readonly<Record<string, unknown>>;
  readonly title: string;
  readonly member: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly formats?: MemberFormats | undefined;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useElementAnswer(query, context);
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
  if (value === undefined) return <span className="text-value">—</span>;
  const target = attrs['target'] as { kind?: unknown; value?: unknown; measure?: unknown } | null;
  const targetValue =
    target?.kind === 'fixed'
      ? numberOf(target.value)
      : target?.kind === 'measure' && typeof target.measure === 'string'
        ? numberOf(row[target.measure])
        : undefined;
  const ranges = Array.isArray(attrs['ranges'])
    ? (attrs['ranges'] as unknown[]).flatMap((range) => numberOf(range) ?? [])
    : [];
  return (
    <BulletGraphSvg
      value={value}
      target={targetValue}
      ranges={ranges}
      min={numberOf(attrs['min']) ?? 0}
      max={numberOf(attrs['max'])}
      title={title}
      member={member}
      formats={formats}
    />
  );
}
