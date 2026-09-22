/**
 * What each of a cube's pre-aggregations declares, listed with it (T148,
 * AC-142): its measures, dimensions, time dimension, granularity, partition
 * granularity and indexes — and, for a lambda or join, the rollups it is made
 * of (research/cube/pre-aggregations.md §1). Every attribute is listed, "none"
 * where the rollup declares none, so a missing one reads as absent from the
 * model rather than from the page.
 *
 * Members as the model writes them (`count`, `CUBE.count`, `orders.count`):
 * this lists the file, it does not resolve it.
 */
type Value = Record<string, unknown>;

const NONE = 'none';

/** A list of members, or one written on its own — as Cube and the form both take it. */
const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((each): each is string => typeof each === 'string')
      : [];

/**
 * A key as the model may write it: its name, its legacy `*_reference(s)`
 * name, or camelCased — Cube's YAML compiler camelises a rollup, so each is
 * accepted (T148's review).
 */
const read = (rollup: Value, ...keys: string[]): unknown =>
  keys.map((key) => rollup[key]).find((value) => value !== undefined);

const listed = (value: unknown) => {
  const all = strings(value);
  return all.length === 0 ? NONE : all.join(', ');
};

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : NONE);

function indexes(value: unknown): string {
  if (!Array.isArray(value)) return NONE;
  const each = value.flatMap((index) => {
    if (typeof index !== 'object' || index === null) return [];
    const { name, columns, sql, type } = index as Value;
    const named = typeof name === 'string' ? name : 'unnamed';
    // On columns, in order; or on SQL, the other form Cube accepts.
    const on = typeof sql === 'string' ? `sql: ${sql}` : strings(columns).join(', ');
    return [`${named} (${on})${type === 'aggregate' ? ', aggregate' : ''}`];
  });
  return each.length === 0 ? NONE : each.join('; ');
}

/** Several time dimensions, each `{dimension, granularity}`, in order. */
function timeDimensions(value: unknown): { dimension: string; granularity: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((each) => {
    if (typeof each !== 'object' || each === null) return [];
    const { dimension, granularity } = each as Value;
    return typeof dimension === 'string'
      ? [{ dimension, granularity: typeof granularity === 'string' ? granularity : NONE }]
      : [];
  });
}

export function rollupFacts(rollup: Value): [label: string, value: string][] {
  const several = timeDimensions(read(rollup, 'time_dimensions', 'timeDimensions'));
  const time = read(
    rollup,
    'time_dimension',
    'time_dimension_reference',
    'timeDimension',
    'timeDimensionReference',
  );
  const facts: [string, string][] = [
    ['Measures', listed(read(rollup, 'measures', 'measure_references', 'measureReferences'))],
    [
      'Dimensions',
      listed(read(rollup, 'dimensions', 'dimension_references', 'dimensionReferences')),
    ],
    [
      'Time dimension',
      time === undefined && several.length > 0
        ? several.map((each) => each.dimension).join(', ')
        : text(time),
    ],
    [
      'Granularity',
      time === undefined && several.length > 0
        ? several.map((each) => each.granularity).join(', ')
        : text(rollup['granularity']),
    ],
    ['Partition granularity', text(read(rollup, 'partition_granularity', 'partitionGranularity'))],
    ['Indexes', indexes(rollup['indexes'])],
  ];
  const type = rollup['type'];
  if (['rollup_join', 'rollupJoin', 'rollup_lambda', 'rollupLambda'].includes(String(type)))
    facts.push([
      'Rollups',
      listed(read(rollup, 'rollups', 'rollup_references', 'rollupReferences')),
    ]);
  return facts;
}

/** One rollup's facts, under its name in the cube's list. */
/** Every string a rollup writes, at any depth: what a refused name may still be. */
function written(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) for (const each of value) written(each, into);
  else if (typeof value === 'object' && value !== null)
    for (const each of Object.values(value)) written(each, into);
  return into;
}

/** Of the names a publish was refused for, those the rollup still writes. */
export function stillUnknown(
  rollup: Value,
  unknown: readonly { readonly list: string; readonly name: string }[],
): readonly { readonly list: string; readonly name: string }[] {
  const writes = written(rollup);
  return unknown.filter(({ name }) => writes.has(name));
}

export function RollupFacts({
  rollup,
  unknown = [],
}: {
  rollup: Value;
  /**
   * What a publish was refused for: names this rollup wrote that the model
   * doesn't have (T207, AC-189). One the rollup no longer writes is not shown.
   */
  unknown?: readonly { readonly list: string; readonly name: string }[];
}) {
  const still = stillUnknown(rollup, unknown);
  return (
    <>
      <dl className="rollup-facts">
        {rollupFacts(rollup).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {still.length === 0 ? null : (
        <p className="rollup-unknown" data-testid="rollup-unknown">
          {/* Icon plus label, never colour alone (direction.md rule 3). */}
          <span data-icon="error" aria-hidden="true">
            ⚠
          </span>{' '}
          Not in the model, so not published:{' '}
          {still.map(({ list, name }, at) => (
            <span key={`${list} ${name}`}>
              {at === 0 ? '' : ', '}
              <code>{name}</code> ({list})
            </span>
          ))}
        </p>
      )}
    </>
  );
}
