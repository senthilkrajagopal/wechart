import { PathPicker } from './PathPicker';
import type { PickerGroup } from './pathCubes';

/**
 * The chart editor's cube picker (T475; AC-329; 2026-09-27 design 10, state
 * D): "Cube or view" names the one chosen, and opens on a "Search cubes and
 * views" box over the cubes on the item's path, grouped by folder, nearest
 * first. Each is listed by its title, C for a cube or V for a view, with its
 * folder path beside it. The user's workspace copy of a landed cube is listed
 * in that cube's place with a "Your copy" chip (T718, AC-428).
 *
 * Design 10's grouped picker (`PathPicker`), over cubes.
 */
export function CubePicker({
  groups,
  value,
  valueTitle,
  onChoose,
}: {
  readonly groups: readonly PickerGroup[];
  /** The cube chosen, by name, or '' for none. */
  readonly value: string;
  /** How the chosen cube is named, by its title. */
  readonly valueTitle: string | undefined;
  readonly onChoose: (name: string) => void;
}) {
  return (
    <PathPicker
      label="Cube or view"
      buttonId="cube-picker"
      empty="Choose a cube or view…"
      searchLabel="Search cubes and views"
      listLabel="Cubes and views"
      noMatch={(typed) => `No cube or view matches “${typed}”.`}
      groups={groups.map((group) => ({
        label: group.label,
        rows: group.rows.map((row) => ({
          key: row.key,
          value: row.cube.name,
          title: row.cube.title,
          kind: row.cube.isView ? ('view' as const) : ('cube' as const),
          path: group.label ?? '',
          chip: row.yours === true ? 'Your copy' : undefined,
          data: { cube: row.cube.name },
        })),
      }))}
      value={value}
      valueTitle={valueTitle}
      onChoose={onChoose}
    />
  );
}
