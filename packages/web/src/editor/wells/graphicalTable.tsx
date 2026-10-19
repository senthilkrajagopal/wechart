import {
  COLUMN_KINDS,
  columnsOf,
  graphicalTableOf,
  newColumn,
  NO_COLUMNS,
  withColumns,
  type ColumnKind,
  type GraphicalTableColumn,
  type IconRule,
} from '@wechart/core';
import { useId, useState, type ReactNode } from 'react';

import { UndoToast } from '../../dashboard/edit/UndoToast';
import { MenuButton } from '../../shell/MenuButton';
import type { Member } from '../fields';
import type { TypeWellsProps } from './registry';

/**
 * The graphical table's wells (T943, AC-570; design 23 sheet 2; direction.md
 * rule 149), after Metrics: Rows (the first dimension), Group rows by (an
 * optional second one) and Columns, an ordered list of Values, Changes,
 * Sparklines, Bullets and Icons.
 *
 * Each column row opens its settings below it, R80's element settings for
 * its kind (design 21 state C, C1–C5), writing the attributes R80's element
 * stores. Its ⋯ menu moves it up or down or removes it, with Undo, so no drag
 * is needed (design 23's keyboard table). With no column, the well says so
 * beside + Column.
 *
 * Inside a chart, a column takes no marking and no filter of its own: the
 * table marks its rows as table tiles do and every column shares the chart's
 * filters (AC-573; decision T943-1).
 */
const NO_OPTIONS: Readonly<Record<string, unknown>> = {};

type Settings = GraphicalTableColumn['settings'];
type Titled = (member: string) => string;
/** R80's Bullet graph's target, as stored. */
type BulletTarget =
  | { readonly kind: 'fixed'; readonly value: number }
  | { readonly kind: 'measure'; readonly measure: string };

const GRAINS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

const DIRECTIONS = [
  { value: 'higher', label: 'Higher is better' },
  { value: 'lower', label: 'Lower is better' },
  { value: 'neutral', label: 'Neutral' },
] as const;

const RULE_OPS: readonly { readonly value: IconRule['op']; readonly label: string }[] = [
  { value: '>=', label: '≥' },
  { value: '>', label: '>' },
  { value: '<=', label: '≤' },
  { value: '<', label: '<' },
  { value: '=', label: '=' },
  { value: 'otherwise', label: 'Otherwise' },
];

/** Design 21 C3's four states, by the words its icons carry. */
const RULE_STATES: readonly { readonly value: IconRule['state']; readonly label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'neutral', label: 'Neutral' },
];

const kindLabel = (kind: ColumnKind): string =>
  COLUMN_KINDS.find((one) => one.kind === kind)?.label ?? kind;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** What a column shows, as design 23 sheet 2 lists them: "Sparkline · Revenue by month, last 12". */
export function columnName(column: GraphicalTableColumn, titleOf: Titled): string {
  const { settings } = column;
  const measure = titleOf(settings.measure);
  const head = `${kindLabel(column.kind)} · ${measure}`;
  switch (column.kind) {
    case 'change': {
      const period = text(settings['period']);
      return `${head} vs ${period === undefined ? 'the previous period' : `last ${period}`}`;
    }
    case 'sparkline': {
      const grain = text(settings['granularity']);
      const last = number(settings['last']);
      return `${head}${grain === undefined ? '' : ` by ${grain}`}${last === undefined ? '' : `, last ${String(last)}`}`;
    }
    case 'bullet': {
      const target = settings['target'] as BulletTarget | undefined;
      if (target === undefined) return head;
      return `${head} vs ${target.kind === 'measure' ? titleOf(target.measure) : String(target.value)}`;
    }
    case 'icon': {
      const of = text(settings['of']);
      return of === undefined ? head : `${head} against ${titleOf(of)}`;
    }
    case 'value':
      return head;
  }
}

/** Settings with keys set, and those given as undefined taken out. */
function patched(settings: Settings, patch: Readonly<Record<string, unknown>>): Settings {
  const next: Record<string, unknown> = { ...settings, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
  return next as Settings;
}

/**
 * A box typed freely and set down on leaving it or on Enter, as Top N and the
 * KPI's values are (AC-216): `read` turns the text into a value, or into
 * `undefined` to put back what was there.
 */
function CommitBox<T>({
  label,
  type,
  shown,
  read,
  onValue,
  placeholder,
}: {
  label: string;
  type: 'number' | 'text';
  shown: string;
  read: (typed: string) => { readonly ok: true; readonly value: T } | { readonly ok: false };
  onValue: (value: T) => void;
  placeholder?: string;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const commit = () => {
    if (typed === null) return;
    const result = read(typed);
    if (result.ok) onValue(result.value);
    setTyped(null);
  };
  return (
    <input
      type={type}
      className="well__value"
      aria-label={label}
      value={typed ?? shown}
      {...(placeholder === undefined ? {} : { placeholder })}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

/** A number, or nothing when the box is emptied. */
const optionalNumber = (typed: string) => {
  const trimmed = typed.trim();
  if (trimmed === '') return { ok: true as const, value: undefined };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { ok: true as const, value } : { ok: false as const };
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="gt-settings__field">
      <span className="gt-settings__label">{label}</span>
      {children}
    </label>
  );
}

function MemberSelect({
  label,
  value,
  members,
  titleOf,
  none,
  onChange,
}: {
  label: string;
  value: string | undefined;
  members: readonly Member[];
  titleOf: Titled;
  /** The empty choice's words; without it a member must be chosen. */
  none?: string;
  onChange: (member: string | undefined) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      >
        {none === undefined && value !== undefined ? null : <option value="">{none ?? ''}</option>}
        {members.map((one) => (
          <option key={one.name} value={one.name}>
            {titleOf(one.name)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Radios<V extends string>({
  label,
  name,
  value,
  choices,
  onChange,
}: {
  label: string;
  name: string;
  value: V;
  choices: readonly { readonly value: V; readonly label: string }[];
  onChange: (value: V) => void;
}) {
  const id = useId();
  return (
    <div className="gt-settings__field">
      <span id={id} className="gt-settings__label">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="gt-settings__choices">
        {choices.map((choice) => (
          <label key={choice.value} className="well__choice">
            <input
              type="radio"
              name={name}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
    </div>
  );
}

interface SettingsProps {
  readonly settings: Settings;
  readonly onSettings: (patch: Readonly<Record<string, unknown>>) => void;
  readonly measures: readonly Member[];
  readonly times: readonly Member[];
  readonly titleOf: Titled;
}

/** Design 21 C1: Measure, Compare with, Over, Period, Show as, Direction. */
function ChangeSettings({ settings, onSettings, times, titleOf }: SettingsProps) {
  const name = useId();
  return (
    <>
      <MemberSelect
        label="Over"
        value={text(settings['time'])}
        members={times}
        titleOf={titleOf}
        none="Choose a time dimension"
        onChange={(time) => onSettings({ time })}
      />
      <div className="gt-settings__field">
        <span className="gt-settings__label">Compare with</span>
        <span>The previous period</span>
      </div>
      <Field label="Period">
        <select
          value={text(settings['period']) ?? ''}
          onChange={(event) => onSettings({ period: text(event.target.value) })}
        >
          <option value="">Choose a period</option>
          {GRAINS.map((grain) => (
            <option key={grain.value} value={grain.value}>
              {grain.label}
            </option>
          ))}
        </select>
      </Field>
      <Radios
        label="Show as"
        name={`${name}-show`}
        value={settings['show'] === 'amount' ? 'amount' : 'percent'}
        choices={[
          { value: 'percent', label: '%' },
          { value: 'amount', label: 'Amount' },
        ]}
        onChange={(show) => onSettings({ show })}
      />
      <Radios
        label="Direction"
        name={`${name}-direction`}
        value={
          settings['direction'] === 'lower' || settings['direction'] === 'neutral'
            ? settings['direction']
            : 'higher'
        }
        choices={DIRECTIONS}
        onChange={(direction) => onSettings({ direction })}
      />
    </>
  );
}

/** Design 21 C2: Over, By, Show the last, Mark the last point. */
function SparklineSettings({ settings, onSettings, times, titleOf }: SettingsProps) {
  const last = number(settings['last']);
  return (
    <>
      <MemberSelect
        label="Over"
        value={text(settings['time'])}
        members={times}
        titleOf={titleOf}
        none="Choose a time dimension"
        onChange={(time) => onSettings({ time })}
      />
      <Field label="By">
        <select
          value={text(settings['granularity']) ?? ''}
          onChange={(event) => onSettings({ granularity: text(event.target.value) })}
        >
          <option value="">Choose a grain</option>
          {GRAINS.map((grain) => (
            <option key={grain.value} value={grain.value}>
              {grain.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="gt-settings__field">
        <span className="gt-settings__label">Periods</span>
        <CommitBox<number | undefined>
          label="Show the last"
          type="number"
          shown={last === undefined ? '' : String(last)}
          read={(typed) => {
            const read = optionalNumber(typed);
            // R80's sparkline takes a whole number of periods from 1.
            const whole = read.ok && (read.value === undefined || Number.isInteger(read.value));
            return whole && (read.value === undefined || read.value >= 1) ? read : { ok: false };
          }}
          onValue={(value) => onSettings({ last: value })}
        />
      </div>
      <label className="well__choice">
        <input
          type="checkbox"
          checked={settings['lastPoint'] === true}
          onChange={(event) => onSettings({ lastPoint: event.target.checked ? true : undefined })}
        />
        Mark the last point
      </label>
    </>
  );
}

/** Design 21 C4: Target (Fixed or a measure), Ranges up to 3 low to high, Min and Max. */
function BulletSettings({ settings, onSettings, measures, titleOf }: SettingsProps) {
  const name = useId();
  const target = settings['target'] as BulletTarget | undefined;
  // A target kind chosen before its value or measure is held here until it has one.
  const [pending, setPending] = useState<'fixed' | 'measure'>('fixed');
  const kind = target?.kind ?? pending;
  const ranges = Array.isArray(settings['ranges']) ? (settings['ranges'] as number[]) : [];
  const [rangesRefused, setRangesRefused] = useState(false);
  const min = number(settings['min']);
  const max = number(settings['max']);
  return (
    <>
      <Radios
        label="Target"
        name={`${name}-target`}
        value={kind}
        choices={[
          { value: 'fixed', label: 'Fixed' },
          { value: 'measure', label: 'A measure' },
        ]}
        onChange={(chosen) => {
          setPending(chosen);
          if (target !== undefined && target.kind !== chosen) onSettings({ target: undefined });
        }}
      />
      {kind === 'measure' ? (
        <MemberSelect
          label="Target measure"
          value={target?.kind === 'measure' ? target.measure : undefined}
          members={measures}
          titleOf={titleOf}
          none="Choose a measure"
          onChange={(member) =>
            onSettings({
              target: member === undefined ? undefined : { kind: 'measure', measure: member },
            })
          }
        />
      ) : (
        <div className="gt-settings__field">
          <span className="gt-settings__label">Target value</span>
          <CommitBox<number | undefined>
            label="Target value"
            type="number"
            shown={target?.kind === 'fixed' ? String(target.value) : ''}
            read={optionalNumber}
            onValue={(value) =>
              onSettings({ target: value === undefined ? undefined : { kind: 'fixed', value } })
            }
          />
        </div>
      )}
      <div className="gt-settings__field">
        <span className="gt-settings__label">Ranges · up to 3, low to high</span>
        <CommitBox<number[] | undefined>
          label="Ranges, low to high"
          type="text"
          shown={ranges.join(', ')}
          placeholder="15, 20, 25"
          read={(typed) => {
            const parts = typed
              .split(',')
              .map((part) => part.trim())
              .filter((part) => part !== '');
            const values = parts.map(Number);
            const ok =
              values.length <= 3 &&
              values.every(Number.isFinite) &&
              values.every((one, at) => at === 0 || (values[at - 1] as number) < one);
            setRangesRefused(!ok);
            if (!ok) return { ok: false };
            return { ok: true, value: values.length === 0 ? undefined : values };
          }}
          onValue={(value) => onSettings({ ranges: value })}
        />
        {rangesRefused ? (
          <p className="panel-section__note" role="status">
            Up to 3 ranges, low to high.
          </p>
        ) : null}
      </div>
      <div className="gt-settings__pair">
        <div className="gt-settings__field">
          <span className="gt-settings__label">Min</span>
          <CommitBox<number | undefined>
            label="Min"
            type="number"
            shown={min === undefined ? '' : String(min)}
            read={optionalNumber}
            onValue={(value) => onSettings({ min: value })}
          />
        </div>
        <div className="gt-settings__field">
          <span className="gt-settings__label">Max</span>
          <CommitBox<number | undefined>
            label="Max"
            type="number"
            shown={max === undefined ? '' : String(max)}
            placeholder="Auto"
            read={optionalNumber}
            onValue={(value) => onSettings({ max: value })}
          />
        </div>
      </div>
    </>
  );
}

/** Design 21 C3: "as % of" a measure, then rules top to bottom, each a condition, a state and a label. */
function IconSettings({ settings, onSettings, measures, titleOf }: SettingsProps) {
  const of = text(settings['of']);
  const rules = Array.isArray(settings['rules']) ? (settings['rules'] as IconRule[]) : [];
  // With "as % of", a rule's value is a percentage on screen and a ratio as R80 stores it.
  const scale = of === undefined ? 1 : 100;
  const setRule = (at: number, rule: IconRule) =>
    onSettings({ rules: rules.map((one, index) => (index === at ? rule : one)) });
  return (
    <>
      <MemberSelect
        label="As % of"
        value={of}
        members={measures}
        titleOf={titleOf}
        none="None: the measure itself"
        onChange={(member) => onSettings({ of: member })}
      />
      <ol className="gt-settings__rules" aria-label="Rules, top to bottom">
        {rules.map((rule, at) => (
          <li
            key={at}
            role="group"
            aria-label={`Rule ${String(at + 1)}`}
            className="gt-settings__rule"
          >
            <Field label="When">
              <select
                value={rule.op}
                onChange={(event) => {
                  const op = event.target.value as IconRule['op'];
                  // Otherwise holds no value; a comparison starts from the one it had, or 0.
                  const next: IconRule = { op, state: rule.state, label: rule.label };
                  setRule(at, op === 'otherwise' ? next : { ...next, value: rule.value ?? 0 });
                }}
              >
                {RULE_OPS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </Field>
            {rule.op === 'otherwise' ? null : (
              <CommitBox<number>
                label="Value"
                type="number"
                shown={rule.value === undefined ? '' : String(rule.value * scale)}
                read={(typed) => {
                  const read = optionalNumber(typed);
                  return read.ok && read.value !== undefined
                    ? { ok: true, value: read.value / scale }
                    : { ok: false };
                }}
                onValue={(value) => setRule(at, { ...rule, value })}
              />
            )}
            <Field label="State">
              <select
                value={rule.state}
                onChange={(event) =>
                  setRule(at, { ...rule, state: event.target.value as IconRule['state'] })
                }
              >
                {RULE_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </Field>
            <CommitBox<string>
              label="Label"
              type="text"
              shown={rule.label}
              read={(typed) =>
                typed.trim() === '' ? { ok: false } : { ok: true, value: typed.trim() }
              }
              onValue={(label) => setRule(at, { ...rule, label })}
            />
            <button
              type="button"
              className="addbtn"
              aria-label={`Remove rule ${String(at + 1)}`}
              onClick={() =>
                onSettings({
                  rules: rules.length === 1 ? undefined : rules.filter((_, index) => index !== at),
                })
              }
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="panel-section__note">No rule matched · no data</p>
      <button
        type="button"
        className="addbtn"
        onClick={() =>
          onSettings({
            rules: [...rules, { op: 'otherwise', state: 'neutral', label: 'Otherwise' }],
          })
        }
      >
        + rule
      </button>
    </>
  );
}

type KindSettings = ((props: SettingsProps) => ReactNode) | undefined;

const KIND_SETTINGS: Readonly<Record<ColumnKind, KindSettings>> = {
  value: undefined,
  change: ChangeSettings,
  sparkline: SparklineSettings,
  bullet: BulletSettings,
  icon: IconSettings,
};

export function GraphicalTableWells({
  options = NO_OPTIONS,
  onOptions,
  available = [],
  titleOf = (member) => member,
  spec,
}: TypeWellsProps) {
  const ids = useId();
  const { rows, groupBy, columns } = graphicalTableOf({
    wells: { measures: spec?.measures ?? [], dimensions: spec?.dimensions ?? [] },
    options,
  });
  const measures = available.filter((one) => one.kind === 'measure');
  const times = available.filter((one) => one.kind === 'timeDimension');
  const firstMeasure = spec?.measures[0] ?? measures[0]?.name;
  const [open, setOpen] = useState<number | null>(null);
  const [removed, setRemoved] = useState<{
    readonly column: GraphicalTableColumn;
    readonly at: number;
  } | null>(null);

  const set = (next: readonly GraphicalTableColumn[]) => {
    onOptions({ graphicalTable: withColumns({}, next)['graphicalTable'] });
  };
  const move = (from: number, to: number) => {
    const next = [...columns];
    const [column] = next.splice(from, 1);
    if (column === undefined) return;
    next.splice(to, 0, column);
    setOpen(null);
    set(next);
  };
  const remove = (at: number) => {
    const column = columns[at];
    if (column === undefined) return;
    setOpen(null);
    setRemoved({ column, at });
    set(columns.filter((_, index) => index !== at));
  };
  const undo = () => {
    if (removed === null) return;
    // Back where it was among what is there now, read fresh from the options.
    const now = [...columnsOf(options)];
    now.splice(Math.min(removed.at, now.length), 0, removed.column);
    setRemoved(null);
    set(now);
  };

  return (
    <>
      <section className="well-field" aria-labelledby={`${ids}-rows`}>
        <h3 id={`${ids}-rows`} className="well-field__label">
          Rows
        </h3>
        <p className="panel-section__note" data-testid="graphicalTable-rows">
          {rows === undefined
            ? 'Put a dimension in Dimensions: one row per member.'
            : titleOf(rows)}
        </p>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-groupBy`}>
        <h3 id={`${ids}-groupBy`} className="well-field__label">
          Group rows by <span className="well-field__opt">optional</span>
        </h3>
        <p className="panel-section__note" data-testid="graphicalTable-groupBy">
          {groupBy === undefined
            ? 'Optional: a second dimension in Dimensions, each of its members heading a section.'
            : `${titleOf(groupBy)}: a section headed by each of its members.`}
        </p>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-columns`}>
        <h3 id={`${ids}-columns`} className="well-field__label">
          Columns <span className="well-field__opt">in order</span>
        </h3>
        <div className="well well--settings gt-columns" data-testid="well-graphicalTable-columns">
          {columns.length === 0 ? (
            <p className="panel-section__note">{NO_COLUMNS}</p>
          ) : (
            <ol className="gt-columns__list" aria-label="Columns">
              {columns.map((column, at) => {
                const name = columnName(column, titleOf);
                const Settings = KIND_SETTINGS[column.kind];
                const expanded = open === at;
                const onSettings = (patch: Readonly<Record<string, unknown>>) =>
                  set(
                    columns.map((one, index) =>
                      index === at ? { ...one, settings: patched(one.settings, patch) } : one,
                    ),
                  );
                return (
                  <li key={`${String(at)}-${column.kind}`} className="gt-columns__item">
                    <div className="gt-columns__row">
                      <button
                        type="button"
                        className="gt-columns__name"
                        aria-expanded={expanded}
                        aria-controls={`${ids}-column-${String(at)}`}
                        onClick={() => setOpen(expanded ? null : at)}
                      >
                        {name}
                      </button>
                      <MenuButton
                        label={`Column ${String(at + 1)}, ${name}: more`}
                        className="addbtn"
                        align="end"
                        items={[
                          {
                            key: 'up',
                            label: 'Move up',
                            disabled: at === 0,
                            onSelect: () => move(at, at - 1),
                          },
                          {
                            key: 'down',
                            label: 'Move down',
                            disabled: at === columns.length - 1,
                            onSelect: () => move(at, at + 1),
                          },
                          {
                            key: 'remove',
                            label: 'Remove',
                            danger: true,
                            separatorBefore: true,
                            onSelect: () => remove(at),
                          },
                        ]}
                      >
                        ⋯
                      </MenuButton>
                    </div>
                    {expanded ? (
                      <div
                        id={`${ids}-column-${String(at)}`}
                        role="group"
                        aria-label={name}
                        className="gt-settings"
                      >
                        <MemberSelect
                          label="Measure"
                          value={column.settings.measure}
                          members={measures}
                          titleOf={titleOf}
                          onChange={(measure) => {
                            if (measure !== undefined) onSettings({ measure });
                          }}
                        />
                        {Settings === undefined ? null : (
                          <Settings
                            settings={column.settings}
                            onSettings={onSettings}
                            measures={measures}
                            times={times}
                            titleOf={titleOf}
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
          <MenuButton
            label="Add a column"
            className="addbtn"
            align="start"
            testId="add-graphicalTableColumn"
            items={COLUMN_KINDS.map(({ kind, label }) => ({
              key: kind,
              label,
              disabled: firstMeasure === undefined,
              ...(firstMeasure === undefined ? { title: 'Put a measure in Metrics first.' } : {}),
              onSelect: () => {
                if (firstMeasure !== undefined) set([...columns, newColumn(kind, firstMeasure)]);
              },
            }))}
          >
            + Column
          </MenuButton>
        </div>
      </section>

      <UndoToast
        message={
          removed === null ? '' : `Removed the column ${columnName(removed.column, titleOf)}.`
        }
        onUndo={undo}
        onDismiss={() => setRemoved(null)}
      />
    </>
  );
}
