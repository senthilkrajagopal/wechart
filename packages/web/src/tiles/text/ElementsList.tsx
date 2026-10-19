import { useId, useState } from 'react';

import { TEXT_ELEMENT_LIMIT, type TextNode } from '@wechart/core';

import { elementName, elementParts, type ElementNames } from './elementName';
import { rangesProblem } from './elements/BulletGraph';

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
  onSelect,
  onChange,
}: {
  /** In text order. */
  readonly elements: readonly TextNode[];
  /** The selected element's place among them, or null. */
  readonly selected: number | null;
  readonly names: ElementNames;
  /** The dashboard's markings, which a Value may be limited by (AC-116). */
  readonly markings?: readonly { readonly name: string }[];
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
          return (
            // Keyed by place: two elements may be the same in every setting.
            <li key={index}>
              <button
                type="button"
                className="text-elements__row"
                aria-current={index === selected ? true : undefined}
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
  onChange,
}: {
  element: TextNode;
  names: ElementNames;
  markings: readonly { readonly name: string }[];
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
        ? [['Label', source]]
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
        <BulletSettings attrs={attrs} onChange={onChange} />
      ) : null}
    </section>
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
 * A Bullet graph's: a fixed target, its ranges — up to 3, low to high — and
 * its minimum and maximum (design 21 C4). A measure as its target is set
 * through the API for now (decision T885-1).
 */
function BulletSettings({
  attrs,
  onChange,
}: {
  attrs: Readonly<Record<string, unknown>>;
  onChange: (settings: Record<string, unknown>) => void;
}) {
  const target = attrs['target'] as { kind?: unknown; value?: unknown } | undefined;
  const fixed = target?.kind === 'fixed' && typeof target.value === 'number' ? target.value : '';
  const ranges = Array.isArray(attrs['ranges']) ? (attrs['ranges'] as unknown[]).join(', ') : '';
  const listed = (typed: string) =>
    typed === '' ? [] : typed.split(',').map((part) => Number(part.trim()));
  return (
    <>
      <NumberField
        label="Target"
        value={String(fixed)}
        check={notANumber}
        onSet={(typed) => {
          const value = asNumber(typed);
          onChange({ target: value === undefined ? null : { kind: 'fixed', value } });
        }}
      />
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
