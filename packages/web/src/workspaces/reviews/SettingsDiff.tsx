import { useMutation, useQuery } from '@tanstack/react-query';
import type { DriverType, FieldValue } from '@wechart/core';

import { clockOf } from '../../shell/formatTime';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { storedRowsOf, storedValuesOf } from '../data-sources/connectionSummary';
import { sourceQuery } from '../data-sources/SourceSettings';
import type { ProposalItem } from './review';

/**
 * A proposed data source's settings against its folder's current one (T356;
 * design 05, state H; rule 83): a setting a row, Setting, Current (version
 * n) and Proposed. What didn't change says "unchanged". A credential is only
 * ever "unchanged", "Replaced" or, for a new one, "Entered": never a value,
 * which neither the browser nor the API ever has.
 */
const SECRET_WORDS = { unchanged: 'unchanged', replaced: 'Replaced', new: 'Entered' } as const;

export function SettingsDiff({
  item,
  alone = false,
  otherLabel = 'Proposed',
  otherFirst = false,
  testable = false,
}: {
  readonly item: ProposalItem;
  /** For one who may approve it while it waits: Test connection (state H; T699). */
  readonly testable?: boolean;
  /** As proposed, set against nothing: a decided proposal's (T356's review). */
  readonly alone?: boolean;
  /** What the other side is: a proposal's, or a kept version's (T515). */
  readonly otherLabel?: string;
  /** The other side's column before Current: a kept version's (design 06, state D). */
  readonly otherFirst?: boolean;
}) {
  const snapshot = item.snapshot as {
    driver?: DriverType;
    authMethod?: string;
    fields?: Readonly<Record<string, FieldValue>>;
    secrets?: readonly string[];
  };
  const current = useQuery({
    ...sourceQuery(item.replaces?.id ?? ''),
    enabled: item.replaces !== null && !alone,
  });
  if (snapshot.driver === undefined || snapshot.authMethod === undefined)
    return <StateLine kind="err">This data source’s settings can’t be read.</StateLine>;

  const proposed = storedRowsOf(
    snapshot.driver,
    storedValuesOf(snapshot.driver, snapshot.authMethod, snapshot.fields ?? {}),
    snapshot.secrets ?? [],
    (key) => (alone ? 'Stored · encrypted' : SECRET_WORDS[item.secretChanges?.[key] ?? 'new']),
  );

  const testBar = testable ? <ReviewTest sourceId={item.id} /> : null;
  if (item.replaces === null || alone)
    return (
      <>
        <table className="review-settings" aria-label="Settings, proposed">
          <thead>
            <tr>
              <th scope="col">Setting</th>
              <th scope="col">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {proposed.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {testBar}
      </>
    );

  const stored = current.data;
  const was = new Map(
    stored === undefined
      ? []
      : storedRowsOf(
          stored.driver,
          storedValuesOf(stored.driver, stored.authMethod, stored.fields),
          Object.entries(stored.secrets)
            .filter(([, secret]) => secret.stored)
            .map(([key]) => key),
        ),
  );
  const labels = [...new Set([...was.keys(), ...proposed.map(([label]) => label)])];
  const now = new Map(proposed);
  const secretRow = (label: string) =>
    Object.values(SECRET_WORDS).includes(
      now.get(label) as (typeof SECRET_WORDS)[keyof typeof SECRET_WORDS],
    );
  return (
    <>
      {current.isError ? (
        <StateLine kind="err">{(current.error as Error).message}</StateLine>
      ) : null}
      <table
        className="review-settings"
        aria-label={`Settings, current and ${otherLabel.toLowerCase()}`}
      >
        <thead>
          <tr>
            <th scope="col">Setting</th>
            {otherFirst ? <th scope="col">{otherLabel}</th> : null}
            <th scope="col">Current (version {item.replaces.version})</th>
            {otherFirst ? null : <th scope="col">{otherLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {labels.map((label) => {
            const before = was.get(label);
            const after = now.get(label);
            const same = !secretRow(label) && before !== undefined && before === after;
            const currentCell = before ?? (current.isPending ? '…' : '—');
            // A kept version first (design 06, state D): each value as it was,
            // and a credential said against now, under Current (rule 83).
            if (otherFirst)
              return (
                <tr key={label} className={same ? undefined : 'is-changed'}>
                  <th scope="row">{label}</th>
                  <td>{secretRow(label) ? 'Stored · encrypted' : (after ?? '—')}</td>
                  <td className={same || after === 'unchanged' ? 'is-same' : undefined}>
                    {secretRow(label) ? after : currentCell}
                  </td>
                </tr>
              );
            return (
              <tr key={label} className={same ? undefined : 'is-changed'}>
                <th scope="row">{label}</th>
                <td>{currentCell}</td>
                <td className={same || after === 'unchanged' ? 'is-same' : undefined}>
                  {same ? 'unchanged' : (after ?? '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {testBar}
    </>
  );
}

interface ReviewTestAnswer {
  readonly ok: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly status: string;
    readonly error?: string;
  }[];
  readonly ranAt: string;
}

async function reviewTestOf(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok)
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : `The test couldn’t be run (${String(response.status)}).`,
    );
  return body;
}

/**
 * Test connection, under the settings (design 05, state H; T699, SEC-22):
 * runs the proposed settings in Cube, as the data source waits frozen in its
 * proposal; first saying when they last passed as proposed.
 */
function ReviewTest({ sourceId }: { sourceId: string }) {
  const url = `/api/data-sources/${encodeURIComponent(sourceId)}/review-test`;
  const passed = useQuery({
    queryKey: ['review-test', sourceId],
    queryFn: async () => (await reviewTestOf(url)) as { passedAt: string | null },
  });
  const run = useMutation({
    mutationFn: async () =>
      (await reviewTestOf(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })) as ReviewTestAnswer,
  });
  const failure = run.data?.checks.find((check) => check.status === 'failed');
  return (
    <div className="review-settings__test">
      <button
        type="button"
        className="btn btn-sm"
        aria-disabled={run.isPending}
        onClick={() => {
          if (!run.isPending) run.mutate();
        }}
      >
        Test connection
      </button>
      <p className="review-settings__tested" data-testid="review-test" role="status">
        {run.isPending ? (
          <>
            <StatusIcon kind="run" />
            <span>Testing…</span>
          </>
        ) : run.isError ? (
          <>
            <StatusIcon kind="err" />
            <span>{run.error.message}</span>
          </>
        ) : run.data !== undefined ? (
          <>
            <StatusIcon kind={run.data.ok ? 'ok' : 'err'} />
            <span>
              {run.data.ok
                ? `Passed · ${clockOf(new Date(run.data.ranAt))}`
                : `Failed · ${clockOf(new Date(run.data.ranAt))}${failure?.error === undefined ? '' : `: ${failure.error}`}`}
            </span>
          </>
        ) : passed.data?.passedAt ? (
          <>
            <StatusIcon kind="ok" />
            <span>{`Passed when proposed · ${clockOf(new Date(passed.data.passedAt))}`}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
