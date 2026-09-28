import { shortAgo } from '../../shell/relativeAge';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import type { ListedSource } from './DataSourcesList';

/**
 * A data source's health, from its newest test of its stored settings
 * (AC-163; references.md surface 10): its icon and its words — never colour
 * alone (direction.md rules 22 and 84) — and how long ago, the time itself on
 * hover (design 01 item 9). Data sources and Generate cubes' Source step say
 * it alike (T490, AC-348).
 */
export function healthOf(source: Pick<ListedSource, 'lastTest'>): {
  kind: StateKind;
  label: string;
} {
  const test = source.lastTest;
  if (test === null) return { kind: 'idle', label: 'Not tested yet' };
  if (!test.current) return { kind: 'idle', label: 'Not tested since it changed' };
  if (test.ok) return { kind: 'ok', label: 'Passed' };
  const failed = test.checks.find((check) => check.status === 'failed');
  return { kind: 'err', label: failed === undefined ? 'Failed' : `Failed at ${failed.id}` };
}

export function HealthBadge({
  source,
  now = new Date(),
  id,
  phrased = false,
}: {
  source: Pick<ListedSource, 'lastTest'>;
  /** For a test to fix the clock. */
  now?: Date;
  id?: string | undefined;
  /** "Last test passed", as a data source's own page says it, not the list's "Passed". */
  phrased?: boolean;
}) {
  const { kind, label } = healthOf(source);
  const ran =
    source.lastTest === null || !source.lastTest.current ? null : new Date(source.lastTest.ranAt);
  return (
    <span
      id={id}
      className={`status status--${kind}`}
      data-testid="source-health"
      data-state={kind}
    >
      <StatusIcon kind={kind} />
      {/* On its own page, what it is the health of is said (design 03 pin 4). */}
      {phrased && kind !== 'idle' ? `Last test ${label.toLowerCase()}` : label}
      {ran === null ? null : (
        <span className="status__when" title={ran.toLocaleString()}>
          {' · '}
          {shortAgo(ran, now)}
        </span>
      )}
    </span>
  );
}
