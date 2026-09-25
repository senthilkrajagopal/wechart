import { useContext, useId, useMemo, useRef, useState } from 'react';

import type { CubeProblem } from '../ProblemsPanel';
import { RollupFacts, stillUnknown } from '../preagg/RollupList';
import { MemberList, ObjectForm, schemaOf } from './ObjectForm';
import { SCHEMA, type Field, type SectionId } from './schema';
import { PickerScopeContext } from './scopes';

/**
 * A cube's or a view's form (T138, AC-132): General — every key that is not
 * a list of members — then a tab per list, in direction.md §7b's order.
 */
type Value = Record<string, unknown>;

/** direction.md §7b: the tabs, and what they are called. */
const TABS: Readonly<Record<'cube' | 'view', readonly [key: string, label: string][]>> = {
  cube: [
    ['dimensions', 'Dimensions'],
    ['measures', 'Measures'],
    ['joins', 'Joins'],
    ['segments', 'Segments'],
    ['hierarchies', 'Hierarchies'],
    ['pre_aggregations', 'Pre-aggregations'],
    ['access_policy', 'Access policy'],
  ],
  view: [
    ['cubes', 'Cubes'],
    ['dimensions', 'Dimensions'],
    ['measures', 'Measures'],
    ['folders', 'Folders'],
    ['default_filters', 'Default filters'],
    ['access_policy', 'Access policy'],
  ],
};

export function CubeForm({
  kind,
  value,
  onChange,
  readOnly = false,
  rollupProblems = [],
  initialTab,
}: {
  kind: 'cube' | 'view';
  /** The tab to open on, one of its own: Schedules opens a cube on its pre-aggregations (T160). */
  initialTab?: string | undefined;
  value: Value;
  onChange: (next: Value) => void;
  /**
   * While the YAML does not parse (T141, AC-135): every field is locked, and
   * the tabs and members can still be browsed.
   */
  readOnly?: boolean;
  /** This cube's rollups a publish was refused for (T207, AC-189), shown on their rows. */
  rollupProblems?: readonly CubeProblem[];
}) {
  const unknownIn = (rollup: Value) =>
    rollupProblems.find((problem) => problem.preAggregation?.name === rollup['name'])
      ?.preAggregation?.unknown;
  /** Whether a rollup here still writes a name a publish was refused for: marked on the tab. */
  const refused = (
    Array.isArray(value['pre_aggregations']) ? (value['pre_aggregations'] as unknown[]) : []
  )
    .filter((rollup): rollup is Value => typeof rollup === 'object' && rollup !== null)
    .some((rollup) => stillUnknown(rollup, unknownIn(rollup) ?? []).length > 0);
  const section: SectionId = kind === 'cube' ? 'Y.3' : 'Y.10';
  const tabs = [['general', 'General'], ...TABS[kind]] as const;
  const listed = new Set(TABS[kind].map(([key]) => key));
  const [open, setOpen] = useState(() =>
    initialTab !== undefined && tabs.some(([key]) => key === initialTab) ? initialTab : 'general',
  );
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const name = typeof value['name'] === 'string' ? value['name'] : kind;
  const { index } = useContext(PickerScopeContext);
  const pickers = useMemo(
    () => ({
      index,
      cube: kind === 'cube' && typeof value['name'] === 'string' ? value['name'] : undefined,
    }),
    [index, kind, value],
  );

  const fieldOf = (key: string): Field | undefined =>
    SCHEMA[section].fields.find((field) => field.key === key);

  return (
    <section className="model-form" aria-label={`${kind === 'cube' ? 'Cube' : 'View'} ${name}`}>
      <div
        role="tablist"
        aria-label={`${name} sections`}
        className="edit-sidebar__tabs model-form__tabs"
      >
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${base}-${key}`}
            ref={(node) => {
              refs.current[index] = node;
            }}
            aria-selected={open === key}
            aria-controls={`${base}-${key}-panel`}
            tabIndex={open === key ? 0 : -1}
            onClick={() => {
              setOpen(key);
            }}
            onKeyDown={(event) => {
              // The APG tabs pattern, as the edit sidebar's.
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              const next = (index + step + tabs.length) % tabs.length;
              setOpen(tabs[next]?.[0] ?? 'general');
              refs.current[next]?.focus();
            }}
          >
            {label}
            {/* A rollup here was refused: said on the tab, before it is opened. */}
            {key === 'pre_aggregations' && refused ? (
              <>
                {' '}
                <span data-icon="error" aria-hidden="true">
                  ⚠
                </span>
                <span className="visually-hidden"> (refused)</span>
              </>
            ) : null}
            {key === 'general' ? null : (
              <span className="model-form__count">
                {' '}
                {Array.isArray(value[key]) ? (value[key] as unknown[]).length : 0}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${open}-panel`}
        aria-labelledby={`${base}-${open}`}
        className="model-form__panel"
      >
        {/* Its pickers name its own members bare, and another cube's by that cube (AC-224). */}
        <PickerScopeContext.Provider value={pickers}>
          {/* Every control is native, so one disabled fieldset locks them all;
            the members' summaries are not controls and still open. */}
          <fieldset className="model-form__lock" disabled={readOnly}>
            {open === 'general' ? (
              <ObjectForm
                schema={SCHEMA[section]}
                value={value}
                onChange={onChange}
                only={(field) => !listed.has(field.key)}
              />
            ) : (
              <MemberList
                schema={schemaOf(
                  fieldOf(open) ?? { key: open, label: open, kind: 'list', of: 'Y.6' },
                )}
                items={Array.isArray(value[open]) ? (value[open] as Value[]) : []}
                // Each rollup listed with what it declares (T148, AC-142).
                describe={
                  open === 'pre_aggregations'
                    ? (rollup: Value) => {
                        const unknown = unknownIn(rollup);
                        return unknown === undefined ? (
                          <RollupFacts rollup={rollup} />
                        ) : (
                          <RollupFacts rollup={rollup} unknown={unknown} />
                        );
                      }
                    : undefined
                }
                onChange={(items) => {
                  const next = { ...value };
                  if (items === undefined || items.length === 0) delete next[open];
                  else next[open] = items;
                  onChange(next);
                }}
              />
            )}
          </fieldset>
        </PickerScopeContext.Provider>
      </div>
    </section>
  );
}
