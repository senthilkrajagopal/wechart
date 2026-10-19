import type { JSONContent } from '@tiptap/core';
import { useEffect } from 'react';

import type { ElementKind } from '@wechart/core';

/**
 * The Text tile's insert menu (T881, AC-517; design 21 pins 4, 6 and 11,
 * state B; rule 129): opened by `/`, `{{` or Insert, an APG combobox whose
 * focus stays in the text, listing the element kinds in three groups, then,
 * as the author types, the measures of the dashboard's cubes, grouped by
 * cube. Its rows are worked out here; the editor drives it (`TextEditor`).
 */

/** What the menu offers elements of: the dashboard's measures, markings, filters and parameters. */
export interface InsertSources {
  readonly cubes: readonly {
    readonly name: string;
    readonly title: string;
    readonly measures: readonly InsertMeasure[];
    /** Its dimensions, which an element's own filter is on (checkpoint 2). */
    readonly dimensions?: readonly InsertMeasure[];
  }[];
  readonly markings: readonly { readonly name: string }[];
  readonly filters: readonly { readonly id: string; readonly name: string }[];
  readonly parameters?: readonly { readonly id: string; readonly name: string }[];
}

export interface InsertMeasure {
  readonly name: string;
  readonly title: string;
}

/**
 * The Copilot group (AC-535): listed while AI is on for this author; for a
 * Super-Admin while it isn't set up, its row disabled, saying where to set
 * it up; otherwise not at all.
 */
export type CopilotOffer = 'on' | 'setup' | undefined;

/** Where the menu is: searching, a measure's kinds (→), or a kind's sources. */
export type InsertStep =
  | { readonly kind: 'search' }
  | { readonly kind: 'measure'; readonly measure: InsertMeasure }
  | { readonly kind: 'source'; readonly element: ElementKind };

export interface InsertRow {
  readonly key: string;
  readonly name: string;
  readonly hint: string;
  /** Why it can't be chosen; absent, it can. */
  readonly disabled?: string;
  /** The element it puts in the text, or the step it goes to. */
  readonly run?:
    | { readonly type: 'insert'; readonly node: JSONContent }
    | { readonly type: 'step'; readonly step: InsertStep };
  /** A measure's row: → lists the kinds that take it. */
  readonly measure?: InsertMeasure;
}

export interface InsertGroup {
  readonly label: string;
  readonly rows: readonly InsertRow[];
}

const KINDS: readonly { kind: ElementKind; name: string; hint: string }[] = [
  { kind: 'value', name: 'Value', hint: 'a measure, formatted' },
  { kind: 'change', name: 'Change', hint: '▲ ▼ against a period' },
  { kind: 'sparkline', name: 'Sparkline', hint: 'a trend, word-sized' },
  { kind: 'icon', name: 'Icon', hint: 'a state, by rule' },
  { kind: 'bulletGraph', name: 'Bullet graph', hint: 'value against a target' },
  { kind: 'marking', name: 'Marking', hint: 'count or summary' },
  { kind: 'filterValue', name: 'Filter value', hint: 'what a filter is set to' },
  { kind: 'asOf', name: 'As of', hint: 'the data’s age' },
];

const CONTROLS: readonly { kind: ElementKind; name: string; hint: string }[] = [
  { kind: 'filterControl', name: 'Filter control', hint: 'one of this dashboard’s' },
  { kind: 'parameterControl', name: 'Parameter control', hint: 'switch a field' },
  { kind: 'actionButton', name: 'Action button', hint: 'page, bookmark, reset, export' },
];

/** The kinds that take a measure, in the menu's order: what → on a measure lists (AC-517). */
export const MEASURE_KINDS: readonly ElementKind[] = [
  'value',
  'change',
  'sparkline',
  'icon',
  'bulletGraph',
  'asOf',
];

const nameOfKind = (kind: ElementKind) =>
  [...KINDS, ...CONTROLS].find((each) => each.kind === kind)?.name ?? kind;

/** Whether what's typed starts a word of the text: "marg" finds "Margin %", never "Summarize". */
function matches(text: string, query: string): boolean {
  if (query === '') return true;
  return text
    .toLowerCase()
    .split(/[\s._]+/)
    .some((word) => word.startsWith(query));
}

const element = (kind: ElementKind, attrs: Record<string, unknown>): JSONContent => ({
  type: kind,
  attrs,
});

/** What choosing a kind does: an element of it from a source, chosen next; a button at once. */
function runOfKind(kind: ElementKind): NonNullable<InsertRow['run']> {
  if (kind === 'actionButton')
    return { type: 'insert', node: element('actionButton', { label: 'Button' }) };
  return { type: 'step', step: { kind: 'source', element: kind } };
}

function kindRow({ kind, name, hint }: { kind: ElementKind; name: string; hint: string }) {
  return { key: `kind-${kind}`, name, hint, run: runOfKind(kind) };
}

function measureRow(measure: InsertMeasure, kind: ElementKind = 'value'): InsertRow {
  return {
    key: `measure-${measure.name}`,
    name: measure.title,
    hint: kind === 'value' ? 'Value' : nameOfKind(kind),
    measure,
    run: { type: 'insert', node: element(kind, { measure: measure.name }) },
  };
}

/** The measures of each cube that what's typed finds, grouped by cube. */
function measureGroups(
  sources: InsertSources,
  query: string,
  kind: ElementKind = 'value',
): InsertGroup[] {
  return sources.cubes
    .map((cube) => ({
      label: cube.title,
      rows: cube.measures
        .filter(
          (measure) =>
            matches(measure.title, query) || matches(measure.name.split('.')[1] ?? '', query),
        )
        .map((measure) => measureRow(measure, kind)),
    }))
    .filter((group) => group.rows.length > 0);
}

/** The menu's groups, for what's typed and where it is. */
export function insertGroups(
  typed: string,
  step: InsertStep,
  sources: InsertSources,
  copilot: CopilotOffer,
): InsertGroup[] {
  const query = typed.trim().toLowerCase();
  if (step.kind === 'measure')
    return [
      {
        label: step.measure.title,
        rows: MEASURE_KINDS.map((kind) => ({
          key: `of-${kind}`,
          name: nameOfKind(kind),
          hint: step.measure.title,
          run: { type: 'insert' as const, node: element(kind, { measure: step.measure.name }) },
        })),
      },
    ];
  if (step.kind === 'source') return sourceGroups(step.element, sources);

  const groups: InsertGroup[] = [
    { label: 'Live values', rows: KINDS.filter((k) => matches(k.name, query)).map(kindRow) },
    { label: 'Controls', rows: CONTROLS.filter((k) => matches(k.name, query)).map(kindRow) },
  ];
  if (copilot !== undefined && matches('Summarize', query))
    groups.push({
      label: 'Copilot',
      rows: [
        {
          key: 'copilot-summarize',
          name: 'Summarize…',
          hint: copilot === 'on' ? 'a reviewed draft' : 'Set up AI in Security › AI',
          ...(copilot === 'on' ? {} : { disabled: 'Set up AI in Security › AI' }),
        },
      ],
    });
  // Measures only once something is typed, so the kinds come first (state B).
  return [
    ...groups.filter((group) => group.rows.length > 0),
    ...(query === '' ? [] : measureGroups(sources, query)),
  ];
}

/** A kind's sources, once the kind is chosen. */
function sourceGroups(kind: ElementKind, sources: InsertSources): InsertGroup[] {
  const name = nameOfKind(kind);
  const none = (why: string): InsertGroup[] => [
    { label: name, rows: [{ key: 'none', name: why, hint: '', disabled: why }] },
  ];
  if (MEASURE_KINDS.includes(kind)) {
    const groups = measureGroups(sources, '', kind);
    return groups.length > 0 ? groups : none('No measures to show here.');
  }
  if (kind === 'marking')
    return sources.markings.length === 0
      ? none('This dashboard has no markings.')
      : [
          {
            label: name,
            rows: sources.markings.map((marking) => ({
              key: `marking-${marking.name}`,
              name: marking.name,
              hint: 'its count',
              run: {
                type: 'insert' as const,
                node: element('marking', { marking: marking.name, show: 'count' }),
              },
            })),
          },
        ];
  if (kind === 'filterValue' || kind === 'filterControl')
    return sources.filters.length === 0
      ? none('This dashboard has no filters.')
      : [
          {
            label: name,
            rows: sources.filters.map((filter) => ({
              key: `filter-${filter.id}`,
              name: filter.name,
              hint: 'a dashboard filter',
              run: { type: 'insert' as const, node: element(kind, { filter: filter.id }) },
            })),
          },
        ];
  const parameters = sources.parameters ?? [];
  return parameters.length === 0
    ? none('This dashboard has no parameters yet.')
    : [
        {
          label: name,
          rows: parameters.map((parameter) => ({
            key: `parameter-${parameter.id}`,
            name: parameter.name,
            hint: 'a dashboard parameter',
            run: {
              type: 'insert' as const,
              node: element('parameterControl', { parameter: parameter.id }),
            },
          })),
        },
      ];
}

/** A row's id, which the text's `aria-activedescendant` names. */
export const rowId = (menuId: string, index: number) => `${menuId}-row-${String(index)}`;

/** The id of the menu's note, which describes the text while it's shown (AC-518). */
export const noteId = (menuId: string) => `${menuId}-note`;

/**
 * The listbox, at the cursor: 320 px wide, 28 px rows (direction §7h), its
 * groups headed as the field picker heads them. A row is chosen by a click
 * too, focus staying in the text.
 */
export function InsertMenu({
  id,
  groups,
  active,
  at,
  note,
  onChoose,
}: {
  readonly id: string;
  readonly groups: readonly InsertGroup[];
  readonly active: number;
  /** Why nothing in it can be chosen: the text holds 10 elements (AC-518). */
  readonly note?: string | undefined;
  /** The cursor's box, which the menu opens under. */
  readonly at: { readonly left: number; readonly bottom: number } | null;
  readonly onChoose: (row: InsertRow) => void;
}) {
  /**
   * The active row in view: focus stays in the text, so the browser never
   * scrolls the list to it (T881's review).
   */
  useEffect(() => {
    window.document.getElementById(rowId(id, active))?.scrollIntoView?.({ block: 'nearest' });
  }, [id, active]);
  /** Each group's first row's place among all the rows. */
  const firsts = groups.map((_, at) =>
    groups.slice(0, at).reduce((count, group) => count + group.rows.length, 0),
  );
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Insert"
      className="insert-menu"
      data-width="320"
      style={
        at === null
          ? undefined
          : { left: `${String(at.left)}px`, top: `${String(at.bottom + 4)}px` }
      }
    >
      {note === undefined ? null : (
        // The text, the combobox, is described by it while the menu is open.
        <p id={noteId(id)} className="insert-menu__note" aria-hidden="true">
          {note}
        </p>
      )}
      {groups.map((group, groupAt) => (
        <div key={group.label} role="group" aria-label={group.label} className="insert-menu__group">
          <div className="insert-menu__heading" aria-hidden="true">
            {group.label}
          </div>
          {group.rows.map((row, rowAt) => {
            const index = (firsts[groupAt] ?? 0) + rowAt;
            return (
              // The keys are the text's, the combobox's (APG): a row takes
              // no focus and no key of its own, only a click.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
              <div
                key={row.key}
                id={rowId(id, index)}
                role="option"
                aria-selected={index === active}
                aria-disabled={row.disabled === undefined ? undefined : true}
                data-name={row.name}
                className="insert-menu__row"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onChoose(row);
                }}
              >
                <span className="insert-menu__name">{row.name}</span>
                {row.hint === '' ? null : <span className="insert-menu__hint">{row.hint}</span>}
              </div>
            );
          })}
        </div>
      ))}
      <p className="insert-menu__foot" aria-hidden="true">
        ↑ ↓ choose · Enter inserts · → for Change, Sparkline… of a measure · Esc closes
      </p>
    </div>
  );
}
