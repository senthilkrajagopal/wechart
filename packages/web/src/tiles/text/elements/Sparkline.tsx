import type { MemberFormats } from '@wechart/core';

import { shortValues } from './shortNumbers';
import { useElementAnswer } from './useElementAnswer';

/** 64 × 16: a word's height (`text-xs`'s line), four of them wide (direction §7h). */
const WORD_WIDTH = 64;
const WORD_HEIGHT = 16;
/** Room for the 2 px line, and the last point's radius, inside the box. */
const INSET = 2;

/**
 * A Sparkline (T885, AC-521; design 21 pin 9, state C2; research §3 option
 * D): wechart's own SVG, never ECharts, built as React elements — no
 * `innerHTML` — 64 × 16, one 2 px line in the measure's dashboard colour,
 * no axes, and a last point only when chosen. An `img` whose text names the
 * measure, the period, the first and last values, and the low and high.
 */
export function SparklineSvg({
  values,
  title,
  member,
  formats,
  granularity,
  last = values.length,
  lastPoint = false,
  colour,
  width: WIDTH = WORD_WIDTH,
  height: HEIGHT = WORD_HEIGHT,
}: {
  /** Its size where it isn't a word's: a KPI's trend, the content width × 32 (T938). */
  readonly width?: number;
  readonly height?: number;
  /** Oldest first. */
  readonly values: readonly number[];
  /** The measure's title, which names it. */
  readonly title: string;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  readonly granularity: string;
  /** How many periods it was asked for. */
  readonly last?: number;
  readonly lastPoint?: boolean;
  readonly colour: string;
}) {
  if (values.length === 0) return <span className="text-value">—</span>;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const step = values.length === 1 ? 0 : (WIDTH - 2 * INSET) / (values.length - 1);
  const points = values.map((value, at) => ({
    x: INSET + at * step,
    // A flat series draws along the middle.
    y: span === 0 ? HEIGHT / 2 : INSET + (1 - (value - low) / span) * (HEIGHT - 2 * INSET),
  }));
  const end = points.at(-1) ?? { x: WIDTH / 2, y: HEIGHT / 2 };
  const d =
    points.length === 1
      ? `M${String(INSET)} ${String(end.y)}H${String(WIDTH - INSET)}`
      : points
          .map((point, at) => `${at === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join('');
  const [first, latest, lowest, highest] = shortValues(
    [values[0] ?? 0, values.at(-1) ?? 0, low, high],
    member,
    formats,
  );
  const periods = `last ${String(last)} ${granularity}${last === 1 ? '' : 's'}`;
  const label = `${title} by ${granularity}, ${periods}: from ${first ?? ''} to ${latest ?? ''}, low ${lowest ?? ''}, high ${highest ?? ''}`;
  return (
    <svg
      className="text-sparkline"
      role="img"
      aria-label={label}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
    >
      <path
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPoint ? (
        <circle cx={points.length === 1 ? WIDTH - INSET : end.x} cy={end.y} r="2" fill={colour} />
      ) : null}
    </svg>
  );
}

/** A Sparkline asked of Cube: the last periods, newest first, drawn oldest first. */
export function SparklineElement({
  query,
  title,
  member,
  attrs,
  formats,
  colour,
  context,
}: {
  /** Its query, or undefined where its measure has no time dimension. */
  readonly query: Readonly<Record<string, unknown>> | undefined;
  readonly title: string;
  readonly member: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly formats?: MemberFormats | undefined;
  readonly colour: string;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useElementAnswer(query, context);
  if (query === undefined) return <span className="text-value">—</span>;
  if (answer.pending)
    return (
      <span className="text-value text-value--waiting" aria-busy="true">
        …
      </span>
    );
  if (answer.error !== undefined)
    return <span className="text-value text-value--unavailable">Unavailable</span>;
  const values = answer.rows
    .map((row) => Number(row[member]))
    .filter((value) => Number.isFinite(value))
    .reverse();
  const granularity = typeof attrs['granularity'] === 'string' ? attrs['granularity'] : 'month';
  const last = typeof attrs['last'] === 'number' ? attrs['last'] : 12;
  return (
    <SparklineSvg
      values={values}
      title={title}
      member={member}
      formats={formats}
      granularity={granularity}
      last={last}
      lastPoint={attrs['lastPoint'] === true}
      colour={colour}
    />
  );
}
