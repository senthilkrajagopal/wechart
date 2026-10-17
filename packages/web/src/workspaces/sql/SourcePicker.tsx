import { DRIVERS, type DriverType } from '@wechart/core';
import type { RefObject } from 'react';

import { PathPicker, type PathPickerGroup, type PathPickerRow } from '../../editor/PathPicker';
import { StatusIcon } from '../../shell/StatusIcon';
import { DriverMark } from '../data-sources/driverMarks';
import { placeOf, STATE_OF, type SqlSourceRow } from './sources';
import { pathText } from './sqlSource';

/**
 * The SQL runner workspace's data source picker (T798; AC-447; design 17,
 * pins 2 and 3, state B): a custom listbox, not a native select, so it keeps
 * the 12 px floor (rule 108). Design 10's grouped picker, as the chart
 * editor's cube picker is (its keys: ↑ ↓, Enter, Esc; typing finds a row).
 *
 * Grouped by folder path: My workspace's first, with "Yours"; then each
 * shared folder's; then Cube Store at the root. Each row has its driver and
 * the runner's state as an icon and a label: "SQL runner on", "Off", or
 * "Yours · no switch" (rule 3). Under the button, the chosen one's folder
 * and state.
 */
const driverLabel = (row: SqlSourceRow) =>
  row.cubeStore
    ? 'Cube Store rollups'
    : row.driver !== null && Object.hasOwn(DRIVERS, row.driver)
      ? DRIVERS[row.driver as DriverType].label
      : (row.driver ?? '');

function State({ row }: { readonly row: SqlSourceRow }) {
  const state = STATE_OF[row.runner];
  return (
    <span className="sql-picker__state">
      <StatusIcon kind={state.icon} />
      {state.label}
    </span>
  );
}

const pickerRowOf = (row: SqlSourceRow): PathPickerRow => ({
  key: row.id,
  value: row.id,
  title: row.name,
  kind: 'cube',
  icon: row.cubeStore ? (
    <span className="driver-mark" aria-hidden="true">
      ▤
    </span>
  ) : Object.hasOwn(DRIVERS, row.driver ?? '') ? (
    <DriverMark type={row.driver as DriverType} />
  ) : null,
  path: (
    <>
      <span className="sql-picker__driver">{driverLabel(row)}</span> <State row={row} />
    </>
  ),
  data: { source: row.id },
});

/** The listbox's groups, My workspace's first and Cube Store's last. */
export function groupsOf(rows: readonly SqlSourceRow[]): PathPickerGroup[] {
  const mine = rows.filter((row) => row.inWorkspace);
  const shared = new Map<string, SqlSourceRow[]>();
  for (const row of rows.filter((each) => !each.inWorkspace && !each.cubeStore)) {
    const place = placeOf(row);
    shared.set(place, [...(shared.get(place) ?? []), row]);
  }
  // The root's own: its data sources, then Cube Store, one group after the
  // folders' (design 17, B1; T798's review: never two "Shared" groups).
  const root = [...(shared.get('Shared') ?? []), ...rows.filter((row) => row.cubeStore)];
  shared.delete('Shared');
  return [
    ...(mine.length === 0
      ? []
      : [{ label: 'My workspace', aside: 'Yours', rows: mine.map(pickerRowOf) }]),
    ...[...shared.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, each]) => ({ label, rows: each.map(pickerRowOf) })),
    ...(root.length === 0 ? [] : [{ label: 'Shared', rows: root.map(pickerRowOf) }]),
  ];
}

export function SourcePicker({
  rows,
  value,
  onChoose,
  buttonRef,
}: {
  readonly rows: readonly SqlSourceRow[];
  /** The chosen one's id, or '' for none. */
  readonly value: string;
  readonly onChoose: (id: string) => void;
  /** For the workspace to put focus on it (T799). */
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const chosen = rows.find((row) => row.id === value);
  return (
    <div className="sql-picker">
      <PathPicker
        label="Data source"
        buttonRef={buttonRef}
        empty="Choose…"
        searchLabel="Find a data source"
        listLabel="Data sources"
        noMatch={(typed) => `No data source matches “${typed}”.`}
        groups={groupsOf(rows)}
        value={value}
        valueTitle={chosen?.name}
        onChoose={onChoose}
        popClass="sql-picker__pop"
        popWidth={360}
      />
      {chosen === undefined ? null : (
        <p className="sql-picker__chosen" data-testid="sql-picker-chosen">
          {chosen.inWorkspace ? 'My workspace' : pathText(chosen.folderPath)} · <State row={chosen} />
        </p>
      )}
    </div>
  );
}
