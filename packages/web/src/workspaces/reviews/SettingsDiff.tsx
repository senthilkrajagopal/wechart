import { useQuery } from '@tanstack/react-query';
import type { DriverType, FieldValue } from '@wechart/core';

import { StateLine } from '../../shell/StatusIcon';
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
}: {
  readonly item: ProposalItem;
  /** As proposed, set against nothing: a decided proposal's (T356's review). */
  readonly alone?: boolean;
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

  if (item.replaces === null || alone)
    return (
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
      <table className="review-settings" aria-label="Settings, current and proposed">
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Current (version {item.replaces.version})</th>
            <th scope="col">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((label) => {
            const before = was.get(label);
            const after = now.get(label);
            const same = !secretRow(label) && before !== undefined && before === after;
            return (
              <tr key={label} className={same ? undefined : 'is-changed'}>
                <th scope="row">{label}</th>
                <td>{before ?? (current.isPending ? '…' : '—')}</td>
                <td className={same || after === 'unchanged' ? 'is-same' : undefined}>
                  {same ? 'unchanged' : (after ?? '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
