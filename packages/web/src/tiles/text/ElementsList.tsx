import { useId, useState } from 'react';

import { TEXT_ELEMENT_LIMIT, type TextNode } from '@wechart/core';

import { StatusIcon } from '../../shell/StatusIcon';
import { ActionList, type ActionListProps } from './ActionList';
import { useDashboardBookmarks } from './dashboardBookmarks';
import { elementName, elementParts, type ElementNames } from './elementName';
import { rangesProblem } from './elements/BulletGraph';
import type { InsertSources } from './InsertMenu';

/**
 * What an Action button's actions may name (T894, AC-530): the dashboard's
 * page tabs and tiles, and — read from the dashboard — its bookmarks.
 */
export type ButtonTargets = Pick<ActionListProps, 'pages' | 'tiles'> & {
  readonly dashboardId: string;
};

/** An Action button's settings, with the dashboard's bookmarks read for them. */
function ButtonSettings({
  attrs,
  targets,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  targets: ButtonTargets;
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const bookmarks = useDashboardBookmarks(targets.dashboardId, true);
  return (
    <ActionList
      attrs={attrs}
      pages={targets.pages}
      bookmarks={bookmarks}
      tiles={targets.tiles}
      onChange={onChange}
    />
  );
}

/**
 * A Text tile's Elements in Properties (T882, AC-519; design 21 pin 13,
 * screen 1): every element in text order, with its kind and its source, and
 * "‹n› of 10"; a row selects its element, whose settings follow below.
 */
export function ElementsList({
  elements,
  selected,
  names,
  markings = [],
  sources,
  broken,
  buttonTargets,
  onSelect,
  onChange,
}: {
  /** What an Action button's actions may name: page tabs, bookmarks, tiles (AC-530). */
  readonly buttonTargets?: ButtonTargets | undefined;
  /** In text order. */
  readonly elements: readonly TextNode[];
  /** The selected element's place among them, or null. */
  readonly selected: number | null;
  readonly names: ElementNames;
  /** The dashboard's markings, which a Value may be limited by (AC-116). */
  readonly markings?: readonly { readonly name: string }[];
  /** The measures and fields an element's settings choose among (checkpoint 2). */
  readonly sources?: InsertSources | undefined;
  /** Whether an element names a member no longer in the model: its row is marked (AC-525). */
  readonly broken?: ((element: TextNode) => boolean) | undefined;
  readonly onSelect: (index: number) => void;
  /** Settings changed for the element at this place; a null takes one away (T884). */
  readonly onChange?: ((index: number, settings: Record<string, unknown>) => void) | undefined;
}) {
  const heading = useId();
  if (elements.length === 0) return null;
  const chosen = selected === null ? undefined : elements[selected];
  const change = (settings: Record<string, unknown>) => {
    if (selected !== null) onChange?.(selected, settings);
  };
  return (
    <div className="text-elements" data-keeps-text-editing="">
      <h4 id={heading} className="text-elements__head">
        <span>Elements</span>
        <span className="text-elements__count">
          {`${String(elements.length)} of ${String(TEXT_ELEMENT_LIMIT)}`}
        </span>
      </h4>
      <ul aria-label="Elements" aria-describedby={heading} className="text-elements__list">
        {elements.map((element, index) => {
          const { kind, source } = elementParts(element, names);
          const fix = broken?.(element) === true;
          return (
            // Keyed by place: two elements may be the same in every setting.
            <li key={index}>
              <button
                type="button"
                className="text-elements__row"
                aria-current={index === selected ? true : undefined}
                data-state={fix ? 'needs-fixing' : undefined}
                // A press keeps focus where it is — in the text, while it's
                // edited — as browsers that don't focus a pressed button
                // would otherwise leave focus nowhere (T882's review).
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onSelect(index);
                }}
              >
                <span className="text-elements__kind">{kind}</span>
                <span className="text-elements__source">{source}</span>
                {fix ? (
                  <span className="text-elements__fix">
                    <StatusIcon kind="warn" /> Needs fixing
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {chosen === undefined ? null : (
        <ElementSettings
          // Its own controls per element, so one's choice never shows on the next.
          key={selected}
          element={chosen}
          names={names}
          markings={markings}
          cubes={sources?.cubes ?? []}
          buttonTargets={buttonTargets}
          onChange={change}
        />
      )}
    </div>
  );
}

/**
 * The selected element's settings (AC-519): what it shows, from where, and
 * its kind's own choices — a Value's and a Change's here (T884, AC-520;
 * design 21 C1, C5); the other kinds' come with their elements' tasks.
 */
function ElementSettings({
  element,
  names,
  markings,
  cubes,
  buttonTargets,
  onChange,
}: {
  element: TextNode;
  names: ElementNames;
  markings: readonly { readonly name: string }[];
  cubes: InsertSources['cubes'];
  buttonTargets: ButtonTargets | undefined;
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const attrs = element.attrs ?? {};
  const measure = typeof attrs['measure'] === 'string' ? attrs['measure'] : undefined;
  const { source } = elementParts(element, names);
  const lines: [string, string][] =
    measure !== undefined
      ? [
          ['Measure', names.measurePath(measure)],
          ...(element.type === 'value' ? [['Format', "The model's"] as [string, string]] : []),
        ]
      : element.type === 'actionButton'
        ? // Its label is set in its own field below (T894).
          []
        : element.type === 'marking'
          ? [['Marking', source]]
          : element.type === 'parameterControl'
            ? [['Parameter', source]]
            : [['Filter', source]];
  return (
    <section
      className="text-element-settings"
      aria-label={`${elementName(element, names)}: settings`}
    >
      <dl>
        {lines.map(([term, value]) => (
          <div key={term} className="text-element-settings__line">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {element.type === 'value' ? (
        <ValueSettings attrs={attrs} markings={markings} onChange={onChange} />
      ) : element.type === 'change' ? (
        <ChangeSettings attrs={attrs} onChange={onChange} />
      ) : element.type === 'sparkline' ? (
        <SparklineSettings attrs={attrs} onChange={onChange} />
      ) : element.type === 'bulletGraph' ? (
        <BulletSettings attrs={attrs} cubes={cubes} onChange={onChange} />
      ) : element.type === 'icon' ? (
        <>
          <MeasureSelect
            label="As a share of"
            none="Nothing: its own value"
            cubes={cubes}
            value={text(attrs['of'])}
            onChoose={(of) => {
              onChange({ of: of ?? null });
            }}
          />
          <IconSettings attrs={attrs} onChange={onChange} />
        </>
      ) : element.type === 'actionButton' ? (
        // Its label, style and ordered actions (T894, AC-530; design 21 E).
        buttonTargets === undefined ? (
          <ActionList attrs={attrs} pages={[]} bookmarks={[]} tiles={[]} onChange={onChange} />
        ) : (
          <ButtonSettings attrs={attrs} targets={buttonTargets} onChange={onChange} />
        )
      ) : element.type === 'marking' ? (
        <Choices
          label="Show"
          options={[
            ['count', 'Count'],
            ['summary', 'Summary'],
          ]}
          value={attrs['show'] === 'summary' ? 'summary' : 'count'}
          onChoose={(show) => {
            onChange({ show });
          }}
        />
      ) : null}
      {measure !== undefined && OWN_FILTER_KINDS.has(element.type) ? (
        <OwnFilters
          attrs={attrs}
          fields={cubes.find((cube) => cube.name === measure.split('.')[0])?.dimensions ?? []}
          onChange={onChange}
        />
      ) : null}
    </section>
  );
}

/** The kinds that take an own filter, added to the tile's (AC-520; decision T868-1). */
const OWN_FILTER_KINDS = new Set(['value', 'change', 'sparkline', 'icon', 'bulletGraph']);

/** A measure chosen from the dashboard's cubes, or none. */
function MeasureSelect({
  label,
  none,
  cubes,
  value,
  onChoose,
}: {
  label: string;
  /** What choosing no measure says. */
  none?: string | undefined;
  cubes: InsertSources['cubes'];
  value: string | undefined;
  onChoose: (measure: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => {
          onChoose(event.target.value === '' ? undefined : event.target.value);
        }}
      >
        {none === undefined ? (
          <option value="" disabled>
            Choose a measure
          </option>
        ) : (
          <option value="">{none}</option>
        )}
        {cubes.map((cube) => (
          <optgroup key={cube.name} label={cube.title}>
            {cube.measures.map((each) => (
              <option key={each.name} value={each.name}>
                {each.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

type OwnFilter = { member: string; operator: 'equals' | 'notEquals'; values: string[] };

const ownFiltersOf = (value: unknown): OwnFilter[] =>
  Array.isArray(value)
    ? (value as unknown[]).flatMap((each) => {
        if (typeof each !== 'object' || each === null) return [];
        const { member, operator, values } = each as Record<string, unknown>;
        return typeof member === 'string' &&
          (operator === 'equals' || operator === 'notEquals') &&
          Array.isArray(values)
          ? [{ member, operator, values: values.filter((one) => typeof one === 'string') }]
          : [];
      })
    : [];

/**
 * An element's own filter, added to its tile's (AC-520; design 21 C1 "Own
 * filter"): each listed as words with its ×; a new one on a field of its
 * measure's cube, is or is not, and its values, added once it has one.
 */
function OwnFilters({
  attrs,
  fields,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  fields: readonly { readonly name: string; readonly title: string }[];
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const ids = { field: useId(), test: useId(), values: useId() };
  const filters = ownFiltersOf(attrs['filters']);
  const [field, setField] = useState(fields[0]?.name ?? '');
  const [test, setTest] = useState<OwnFilter['operator']>('equals');
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const titleOf = (member: string) => fields.find((each) => each.name === member)?.title ?? member;
  const wordsOf = (filter: OwnFilter) =>
    `${titleOf(filter.member)} ${filter.operator === 'notEquals' ? 'is not' : 'is'} ${filter.values.join(', ')}`;
  const set = (next: readonly OwnFilter[]) => {
    onChange({ filters: next.length === 0 ? null : next });
  };
  return (
    <fieldset className="text-element-settings__own">
      <legend>Own filter</legend>
      <ul aria-label="Own filter" className="text-element-settings__own-list">
        {filters.map((filter, at) => (
          // Kept in their order, one per place.
          <li key={`own-${String(at)}`}>
            {wordsOf(filter)}
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-label={`Remove ${wordsOf(filter)}`}
              onClick={() => {
                set(filters.filter((_, index) => index !== at));
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {fields.length === 0 ? (
        <p className="text-element-settings__note">Its cube has no text fields to filter on.</p>
      ) : (
        <div className="text-element-settings__own-new">
          <label htmlFor={ids.field}>Filter field</label>
          <select
            id={ids.field}
            value={field}
            onChange={(event) => {
              setField(event.target.value);
            }}
          >
            {fields.map((each) => (
              <option key={each.name} value={each.name}>
                {each.title}
              </option>
            ))}
          </select>
          <label htmlFor={ids.test}>Filter test</label>
          <select
            id={ids.test}
            value={test}
            onChange={(event) => {
              setTest(event.target.value === 'notEquals' ? 'notEquals' : 'equals');
            }}
          >
            <option value="equals">is</option>
            <option value="notEquals">is not</option>
          </select>
          <label htmlFor={ids.values}>Filter values</label>
          <input
            id={ids.values}
            type="text"
            value={typed}
            placeholder="Values, separated by commas"
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const values = typed
                .split(',')
                .map((one) => one.trim())
                .filter((one) => one !== '');
              if (values.length === 0) {
                setProblem('Type a value to filter by.');
                return;
              }
              setProblem(undefined);
              setTyped('');
              set([...filters, { member: field, operator: test, values }]);
            }}
          >
            Add filter
          </button>
          {problem === undefined ? null : (
            <p role="alert" className="text-element-settings__problem">
              {problem}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** A set of choices of which one is on: radios, by name (design 21's segments). */
function Choices({
  label,
  options,
  value,
  onChoose,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  onChoose: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="text-element-settings__choices">
      <legend>{label}</legend>
      {options.map(([option, words]) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => {
              onChoose(option);
            }}
          />
          {words}
        </label>
      ))}
    </fieldset>
  );
}

/** A Value's: Limit by marking, and, limited, what it shows with nothing marked (AC-116). */
function ValueSettings({
  attrs,
  markings,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  markings: readonly { readonly name: string }[];
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const id = useId();
  const marking = text(attrs['marking']);
  return (
    <>
      <div className="field">
        <label htmlFor={id}>Limit by marking</label>
        <select
          id={id}
          value={marking ?? ''}
          onChange={(event) => {
            const chosen = event.target.value;
            onChange(chosen === '' ? { marking: null, whenUnmarked: null } : { marking: chosen });
          }}
        >
          <option value="">None</option>
          {markings.map((one) => (
            <option key={one.name} value={one.name}>
              {one.name}
            </option>
          ))}
        </select>
      </div>
      {marking === undefined ? null : (
        <Choices
          label="When nothing is marked, show"
          options={[
            ['all', 'All data'],
            ['none', '"—"'],
          ]}
          value={attrs['whenUnmarked'] === 'none' ? 'none' : 'all'}
          onChoose={(whenUnmarked) => {
            onChange({ whenUnmarked });
          }}
        />
      )}
    </>
  );
}

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['quarter', 'Quarter'],
  ['year', 'Year'],
] as const;

const GRANULARITIES = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['quarter', 'Quarter'],
  ['year', 'Year'],
] as const;

/**
 * A number field set when it's left, a blank taking the setting away, and
 * what can't be one refused with its reason, nothing set.
 */
function NumberField({
  label,
  value,
  check,
  onSet,
}: {
  label: string;
  value: string;
  /** Why the text can't be set, or undefined. */
  check?: (text: string) => string | undefined;
  onSet: (text: string) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState(value);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={typed}
        aria-invalid={problem === undefined ? undefined : true}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        onBlur={() => {
          const refused = check?.(typed.trim());
          setProblem(refused);
          if (refused === undefined && typed.trim() !== value) onSet(typed.trim());
        }}
      />
      {problem === undefined ? null : (
        <p role="alert" className="text-element-settings__problem">
          {problem}
        </p>
      )}
    </div>
  );
}

const asNumber = (typed: string): number | undefined => {
  if (typed === '') return undefined;
  const number = Number(typed);
  return Number.isFinite(number) ? number : undefined;
};
const notANumber = (typed: string) =>
  typed === '' || asNumber(typed) !== undefined ? undefined : 'Type a number.';

/** A Sparkline's: its granularity, how many periods, and its last point (design 21 C2). */
function SparklineSettings({
  attrs,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const id = useId();
  const last = typeof attrs['last'] === 'number' ? attrs['last'] : 12;
  return (
    <>
      <div className="field">
        <label htmlFor={id}>By</label>
        <select
          id={id}
          value={text(attrs['granularity']) ?? 'month'}
          onChange={(event) => {
            onChange({ granularity: event.target.value });
          }}
        >
          {GRANULARITIES.map(([granularity, words]) => (
            <option key={granularity} value={granularity}>
              {words}
            </option>
          ))}
        </select>
      </div>
      <NumberField
        label="Show the last"
        value={String(last)}
        check={(typed) =>
          /^[1-9]\d{0,3}$/.test(typed) ? undefined : 'Type a whole number from 1.'
        }
        onSet={(typed) => {
          onChange({ last: Number(typed) });
        }}
      />
      <label className="tile-properties__check">
        <input
          type="checkbox"
          checked={attrs['lastPoint'] === true}
          onChange={(event) => {
            onChange({ lastPoint: event.target.checked ? true : null });
          }}
        />
        Mark the last point
      </label>
    </>
  );
}

/**
 * A Bullet graph's: its target, a fixed value or a measure, its ranges — up
 * to 3, low to high — and its minimum and maximum (design 21 C4).
 */
function BulletSettings({
  attrs,
  cubes,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  cubes: InsertSources['cubes'];
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const target = attrs['target'] as
    { kind?: unknown; value?: unknown; measure?: unknown } | undefined;
  const fixed = target?.kind === 'fixed' && typeof target.value === 'number' ? target.value : '';
  /** A measure as its target: chosen next, nothing set until it is. */
  const [byMeasure, setByMeasure] = useState(target?.kind === 'measure');
  const ranges = Array.isArray(attrs['ranges']) ? (attrs['ranges'] as unknown[]).join(', ') : '';
  const listed = (typed: string) =>
    typed === '' ? [] : typed.split(',').map((part) => Number(part.trim()));
  return (
    <>
      <Choices
        label="Target is"
        options={[
          ['fixed', 'A value'],
          ['measure', 'A measure'],
        ]}
        value={byMeasure ? 'measure' : 'fixed'}
        onChoose={(kind) => {
          setByMeasure(kind === 'measure');
        }}
      />
      {byMeasure ? (
        <MeasureSelect
          label="Target measure"
          cubes={cubes}
          value={target?.kind === 'measure' ? text(target.measure) : undefined}
          onChoose={(measure) => {
            if (measure !== undefined) onChange({ target: { kind: 'measure', measure } });
          }}
        />
      ) : (
        <NumberField
          label="Target"
          value={String(fixed)}
          check={notANumber}
          onSet={(typed) => {
            const value = asNumber(typed);
            onChange({ target: value === undefined ? null : { kind: 'fixed', value } });
          }}
        />
      )}
      <NumberField
        label="Ranges, low to high"
        value={ranges}
        check={(typed) => {
          const numbers = listed(typed);
          if (numbers.some((number) => !Number.isFinite(number)))
            return 'Type numbers, separated by commas.';
          return rangesProblem(numbers);
        }}
        onSet={(typed) => {
          const numbers = listed(typed);
          onChange({ ranges: numbers.length === 0 ? null : numbers });
        }}
      />
      <NumberField
        label="Min"
        value={typeof attrs['min'] === 'number' ? String(attrs['min']) : '0'}
        check={notANumber}
        onSet={(typed) => {
          onChange({ min: asNumber(typed) ?? null });
        }}
      />
      <NumberField
        label="Max"
        value={typeof attrs['max'] === 'number' ? String(attrs['max']) : ''}
        check={notANumber}
        onSet={(typed) => {
          onChange({ max: asNumber(typed) ?? null });
        }}
      />
    </>
  );
}

const OPS = [
  ['>=', '≥'],
  ['>', '>'],
  ['<=', '≤'],
  ['<', '<'],
  ['=', '='],
  ['otherwise', 'Otherwise'],
] as const;

const STATES = [
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['error', 'Error'],
  ['neutral', 'Neutral'],
] as const;

type Rule = Readonly<Record<string, unknown>>;

/**
 * An Icon's rules, top to bottom, the first that matches showing (design 21
 * C3): each a condition, one of the four states and its label. A measure as
 * the one it's a share of is set through the API for now (decision T886-1).
 */
function IconSettings({
  attrs,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const rules: Rule[] = Array.isArray(attrs['rules'])
    ? (attrs['rules'] as unknown[]).filter(
        (rule): rule is Rule => typeof rule === 'object' && rule !== null,
      )
    : [];
  const set = (next: readonly Rule[]) => {
    onChange({ rules: next.length === 0 ? null : next });
  };
  const changeRule = (at: number, patch: Rule) => {
    set(rules.map((rule, index) => (index === at ? { ...rule, ...patch } : rule)));
  };
  return (
    <div className="text-element-settings__rules">
      <ol aria-label="Rules" className="text-element-settings__rule-list">
        {rules.map((rule, at) => (
          // Rules are kept in their order, one per place.
          <li key={`rule-${String(at)}`} className="text-element-settings__rule">
            <select
              aria-label={`Rule ${String(at + 1)} condition`}
              value={typeof rule['op'] === 'string' ? rule['op'] : '>='}
              onChange={(event) => {
                const op = event.target.value;
                // Otherwise has no value to compare with.
                changeRule(at, op === 'otherwise' ? { op, value: undefined } : { op });
              }}
            >
              {OPS.map(([op, words]) => (
                <option key={op} value={op}>
                  {words}
                </option>
              ))}
            </select>
            {rule['op'] === 'otherwise' ? null : (
              <NumberField
                label={`Rule ${String(at + 1)} value`}
                value={typeof rule['value'] === 'number' ? String(rule['value']) : ''}
                check={(typed) => (asNumber(typed) === undefined ? 'Type a number.' : undefined)}
                onSet={(typed) => {
                  changeRule(at, { value: asNumber(typed) });
                }}
              />
            )}
            <select
              aria-label={`Rule ${String(at + 1)} state`}
              value={typeof rule['state'] === 'string' ? rule['state'] : 'neutral'}
              onChange={(event) => {
                changeRule(at, { state: event.target.value });
              }}
            >
              {STATES.map(([state, words]) => (
                <option key={state} value={state}>
                  {words}
                </option>
              ))}
            </select>
            <NumberField
              label={`Rule ${String(at + 1)} label`}
              value={typeof rule['label'] === 'string' ? rule['label'] : ''}
              check={(typed) => (typed === '' ? 'A rule needs a label.' : undefined)}
              onSet={(label) => {
                changeRule(at, { label });
              }}
            />
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-label={`Remove rule ${String(at + 1)}`}
              onClick={() => {
                set(rules.filter((_, index) => index !== at));
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          set([...rules, { op: 'otherwise', state: 'neutral', label: 'Otherwise' }]);
        }}
      >
        + rule
      </button>
    </div>
  );
}

/** A Change's: the period it compares, % or an amount, and its direction (design 21 C1). */
function ChangeSettings({
  attrs,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const id = useId();
  return (
    <>
      <p className="text-element-settings__note">Compared with the previous period.</p>
      <div className="field">
        <label htmlFor={id}>Period</label>
        <select
          id={id}
          // A month where it names none (decision T884-1).
          value={text(attrs['period']) ?? 'month'}
          onChange={(event) => {
            onChange({ period: event.target.value });
          }}
        >
          {PERIODS.map(([period, words]) => (
            <option key={period} value={period}>
              {words}
            </option>
          ))}
        </select>
      </div>
      <Choices
        label="Show as"
        options={[
          ['percent', '%'],
          ['amount', 'Amount'],
        ]}
        value={attrs['show'] === 'amount' ? 'amount' : 'percent'}
        onChoose={(show) => {
          onChange({ show });
        }}
      />
      <Choices
        label="Direction"
        options={[
          ['higher', 'Higher is better'],
          ['lower', 'Lower is better'],
          ['neutral', 'Neutral'],
        ]}
        value={text(attrs['direction']) ?? 'higher'}
        onChoose={(direction) => {
          onChange({ direction });
        }}
      />
    </>
  );
}
