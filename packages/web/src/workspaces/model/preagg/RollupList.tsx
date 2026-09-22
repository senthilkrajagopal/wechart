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

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];

const listed = (value: unknown) => {
  const all = strings(value);
  return all.length === 0 ? NONE : all.join(', ');
};

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : NONE);

function indexes(value: unknown): string {
  if (!Array.isArray(value)) return NONE;
  const each = value.flatMap((index) => {
    if (typeof index !== 'object' || index === null) return [];
    const { name, columns, type } = index as Value;
    const named = typeof name === 'string' ? name : 'unnamed';
    return [
      `${named} (${strings(columns).join(', ')})${type === 'aggregate' ? ', aggregate' : ''}`,
    ];
  });
  return each.length === 0 ? NONE : each.join('; ');
}

export function rollupFacts(rollup: Value): [label: string, value: string][] {
  const facts: [string, string][] = [
    ['Measures', listed(rollup['measures'])],
    ['Dimensions', listed(rollup['dimensions'])],
    ['Time dimension', text(rollup['time_dimension'])],
    ['Granularity', text(rollup['granularity'])],
    ['Partition granularity', text(rollup['partition_granularity'])],
    ['Indexes', indexes(rollup['indexes'])],
  ];
  if (rollup['type'] === 'rollup_join' || rollup['type'] === 'rollup_lambda')
    facts.push(['Rollups', listed(rollup['rollups'])]);
  return facts;
}

/** One rollup's facts, under its name in the cube's list. */
export function RollupFacts({ rollup }: { rollup: Value }) {
  return (
    <dl className="rollup-facts">
      {rollupFacts(rollup).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
