/**
 * Quick calculations in a query's answer (AC-048).
 *
 * The chart's query asks xcube for each calculation in its `calculations`
 * block (`toCubeQuery`), and Cube computes it as a companion multi-stage
 * measure. The answer names it `<measure>__xc_<calculation>`, a suffix no
 * authored member may hold (research `xcube-quick-calcs.md`, "The answer").
 * A chart draws its rows by its measures' names, so each such column is read
 * back under its measure's name: the value is Cube's, as it came, never one
 * worked out here.
 */

type Query = Readonly<Record<string, unknown>>;
type Row = Record<string, unknown>;

/** The suffix xcube reserves for a calculation's column. */
const COMPANION = '__xc_';

/** The kinds that run over the chart's periods (xcube's `PERIOD_KINDS` but `previous_period`, which wechart doesn't ask). */
const OVER_TIME = new Set(['difference', 'pct_difference', 'running_total', 'moving_average']);

interface Asked {
  readonly measure?: unknown;
  readonly kind?: unknown;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A query's calculations, as its block asks them. */
function calculationsOf(query: Query): readonly Asked[] {
  const block = query['calculations'];
  return Array.isArray(block) ? (block as unknown[]).filter(isPlain) : [];
}

/** The measures a query asks a calculation of. */
function calculatedOf(query: Query): string[] {
  return calculationsOf(query).flatMap(({ measure }) =>
    typeof measure === 'string' ? [measure] : [],
  );
}

/** A key as the measure it is a calculation of, or as it is. */
function measureOf(key: string, calculated: readonly string[]): string {
  const at = key.indexOf(COMPANION);
  if (at <= 0) return key;
  const measure = key.slice(0, at);
  return calculated.includes(measure) ? measure : key;
}

const renamed = (value: unknown, calculated: readonly string[]) =>
  isPlain(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, each]) => [measureOf(key, calculated), each]),
      )
    : value;

/**
 * The answer with each calculation's column under its measure's name, in its
 * rows and in Cube's annotation of them. An answer to a query that asks no
 * calculation is returned as it is.
 */
export function calculatedAnswer(answer: unknown, query: Query): unknown {
  const calculated = calculatedOf(query);
  if (calculated.length === 0 || !isPlain(answer)) return answer;
  const out: Record<string, unknown> = { ...answer };
  if (Array.isArray(answer['data']))
    out['data'] = (answer['data'] as unknown[]).map((row) => renamed(row, calculated));
  const annotation = answer['annotation'];
  if (isPlain(annotation))
    out['annotation'] = Object.fromEntries(
      Object.entries(annotation).map(([section, members]) => [
        section,
        renamed(members, calculated),
      ]),
    );
  return out;
}

/** Whether the query's one time dimension at a grain has a range: what a running total filters on. */
function hasRange(query: Query): boolean {
  const times = query['timeDimensions'];
  return (
    Array.isArray(times) &&
    (times as unknown[]).some(
      (each) =>
        isPlain(each) && typeof each['granularity'] === 'string' && each['dateRange'] !== undefined,
    )
  );
}

/**
 * The queries to ask for this one. xcube refuses a running total over a
 * range beside a difference, a % difference or a moving average in one query
 * (`combination`): the range it filters on, so the total starts there, would
 * cut the periods the others read before it. So the running totals are asked
 * in a query of their own, and every other measure in another, each with the
 * chart's dimensions, time and filters. Any other query is asked as it is.
 */
export function splitCalculations(query: Query): Query[] {
  const asked = calculationsOf(query);
  const running = asked.filter(({ kind }) => kind === 'running_total');
  const otherOverTime = asked.some(
    ({ kind }) => typeof kind === 'string' && kind !== 'running_total' && OVER_TIME.has(kind),
  );
  if (running.length === 0 || !otherOverTime || !hasRange(query)) return [query];
  const totals = new Set(running.map(({ measure }) => measure));
  const measures = Array.isArray(query['measures']) ? (query['measures'] as unknown[]) : [];
  const part = (keep: (measure: unknown) => boolean): Query => {
    const order = query['order'];
    const kept = (member: unknown) => !measures.includes(member) || keep(member);
    return {
      ...query,
      measures: measures.filter(keep),
      calculations: asked.filter(({ measure }) => keep(measure)),
      ...(Array.isArray(order)
        ? { order: (order as unknown[]).filter((each) => !Array.isArray(each) || kept(each[0])) }
        : isPlain(order)
          ? { order: Object.fromEntries(Object.entries(order).filter(([member]) => kept(member))) }
          : {}),
    };
  };
  return [part((measure) => totals.has(measure)), part((measure) => !totals.has(measure))];
}

/** A row's place in the answer: every value but its measures'. */
function keyOf(row: Row, measures: ReadonlySet<string>): string {
  return JSON.stringify(
    Object.entries(row)
      .filter(([column]) => !measures.has(column))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/** The query's time column at its grain, by which Cube orders such an answer. */
function timeColumnOf(query: Query): string | undefined {
  const times = query['timeDimensions'];
  if (!Array.isArray(times)) return undefined;
  const granular = (times as unknown[]).find(
    (each) => isPlain(each) && typeof each['granularity'] === 'string',
  ) as Record<string, string> | undefined;
  return granular === undefined ? undefined : `${granular['dimension']}.${granular['granularity']}`;
}

/**
 * The answers to a query asked apart (`splitCalculations`), as one: each row
 * with every part's measures, joined by the rest of its columns, a row one
 * part has and another lacks kept with what it has (a period with no
 * previous one has no row of its own: research `xcube-quick-calcs.md`,
 * Gotcha 5), in time order where the query has a time at a grain. The data
 * are as old as the oldest part's, and served from rollups only where every
 * part was.
 */
export function joinAnswers(answers: readonly unknown[], query: Query): unknown {
  const parts = answers.filter(isPlain);
  const [first] = parts;
  if (first === undefined) return answers[0];
  const measures = new Set(
    (Array.isArray(query['measures']) ? (query['measures'] as unknown[]) : []).filter(
      (each): each is string => typeof each === 'string',
    ),
  );
  const rows = new Map<string, Row>();
  for (const part of parts)
    for (const row of Array.isArray(part['data']) ? (part['data'] as unknown[]) : [])
      if (isPlain(row)) {
        const key = keyOf(row, measures);
        rows.set(key, { ...rows.get(key), ...row });
      }
  const time = timeColumnOf(query);
  const data = [...rows.values()];
  if (time !== undefined)
    data.sort((a, b) => {
      const [x, y] = [String(a[time] ?? ''), String(b[time] ?? '')];
      return x < y ? -1 : x > y ? 1 : 0;
    });

  const annotation: Record<string, Record<string, unknown>> = {};
  for (const part of parts)
    if (isPlain(part['annotation']))
      for (const [section, members] of Object.entries(part['annotation']))
        if (isPlain(members)) annotation[section] = { ...annotation[section], ...members };

  const refreshed = parts
    .map((part) => part['lastRefreshTime'])
    .filter((each): each is string => typeof each === 'string')
    .sort();
  const rollups = parts.map((part) => part['usedPreAggregations']);
  const { lastRefreshTime: _first, usedPreAggregations: _used, ...rest } = first;
  void _first;
  void _used;
  return {
    ...rest,
    data,
    annotation,
    ...(refreshed[0] === undefined ? {} : { lastRefreshTime: refreshed[0] }),
    ...(rollups.every(isPlain)
      ? { usedPreAggregations: Object.assign({}, ...(rollups as Record<string, unknown>[])) }
      : {}),
  };
}
