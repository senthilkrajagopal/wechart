import {
  REFERENCE_STATS,
  referenceFormProblem,
  type ComboAxis,
  type ComboReference,
  type ReferenceDirection,
  type ReferenceLabelAt,
  type ReferenceStat,
  type TimeGranularity,
} from '@wechart/core';
import { useId, useState } from 'react';

/**
 * The reference form (T862; AC-507; design 20 state F): + Line, + Band and
 * a row's Edit open it inline under the list.
 *
 * - **Direction:** Horizontal reads one value axis; Vertical reads the
 *   category axis, a member, or on a time axis a date at its granularity (a
 *   month on a month axis).
 * - **Value:** a horizontal line's is Fixed, or the Average, Median,
 *   Minimum or Maximum of a series drawn on its axis (20-Q7 (a)). A band
 *   takes From and To.
 * - **Label:** required, drawn in the chart; Show value adds the value;
 *   Label at Start or End.
 *
 * Add stays disabled, saying why, until the label is in, the value is, and a
 * band's From is below its To (`referenceFormProblem`).
 */
export interface ReferenceFormProps {
  readonly kind: 'line' | 'band';
  /** A reference being edited; absent, a new one. */
  readonly initial?: ComboReference | undefined;
  /** The value axes drawn, each with the measures on it, by their titles. */
  readonly axes: readonly {
    readonly axis: ComboAxis;
    readonly measures: readonly { readonly measure: string; readonly title: string }[];
  }[];
  /** The category axis: time at a granularity, or members. */
  readonly category:
    | { readonly kind: 'time'; readonly granularity: TimeGranularity | undefined }
    | { readonly kind: 'members'; readonly members: readonly string[] };
  /** An id for a new reference. */
  readonly newId: () => string;
  readonly onSubmit: (reference: ComboReference) => void;
  readonly onCancel: () => void;
}

const STAT_NAMES: Record<ReferenceStat, string> = {
  average: 'Average of a series',
  median: 'Median of a series',
  minimum: 'Minimum of a series',
  maximum: 'Maximum of a series',
};
const AXIS_NAMES: Record<ComboAxis, string> = { left: 'Left', right: 'Right' };

/** The input a date on a time axis takes, by its granularity. */
function dateInput(granularity: TimeGranularity | undefined): 'month' | 'date' {
  return granularity === 'month' || granularity === 'quarter' || granularity === 'year'
    ? 'month'
    : 'date';
}

const text = (value: number | string | undefined) => (value === undefined ? '' : String(value));

export function ReferenceForm({
  kind,
  initial,
  axes,
  category,
  newId,
  onSubmit,
  onCancel,
}: ReferenceFormProps) {
  const id = useId();
  const [direction, setDirection] = useState<ReferenceDirection>(
    initial?.direction ?? 'horizontal',
  );
  const [axis, setAxis] = useState<ComboAxis>(initial?.axis ?? axes[0]?.axis ?? 'left');
  const [source, setSource] = useState<'fixed' | ReferenceStat>(initial?.stat ?? 'fixed');
  const onAxis = axes.find((one) => one.axis === axis)?.measures ?? [];
  const [series, setSeries] = useState<string | undefined>(initial?.series);
  const [value, setValue] = useState(text(initial?.value));
  const [from, setFrom] = useState(text(initial?.from));
  const [to, setTo] = useState(text(initial?.to));
  const [label, setLabel] = useState(initial?.label ?? '');
  const [showValue, setShowValue] = useState(initial?.showValue === true);
  const [labelAt, setLabelAt] = useState<ReferenceLabelAt>(initial?.labelAt ?? 'end');

  const horizontal = direction === 'horizontal';
  /** A value as the reference keeps it: a number across a value axis, text up from the category axis. */
  const kept = (raw: string): number | string | undefined => {
    if (raw.trim() === '') return undefined;
    if (!horizontal) return raw;
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  };
  const chosenSeries = series ?? onAxis[0]?.measure;
  const computed = kind === 'line' && horizontal && source !== 'fixed';
  const reference: ComboReference = {
    id: initial?.id ?? newId(),
    kind,
    direction,
    ...(horizontal ? { axis } : {}),
    ...(kind === 'band'
      ? {
          ...(kept(from) === undefined ? {} : { from: kept(from) }),
          ...(kept(to) === undefined ? {} : { to: kept(to) }),
        }
      : computed
        ? { stat: source, ...(chosenSeries === undefined ? {} : { series: chosenSeries }) }
        : kept(value) === undefined
          ? {}
          : { value: kept(value) }),
    label: label.trim(),
    ...(showValue ? { showValue: true } : {}),
    labelAt,
  } as ComboReference;
  const missing =
    kind === 'band'
      ? reference.from === undefined || reference.to === undefined
        ? 'A band needs its From and To'
        : undefined
      : computed
        ? reference.series === undefined
          ? 'A computed line needs a series'
          : undefined
        : reference.value === undefined
          ? 'A line needs its value'
          : undefined;
  const why = referenceFormProblem(reference) ?? missing;

  /** A value field: a number across a value axis; up from the category axis, a date or a member. */
  const valueField = (name: string, current: string, set: (next: string) => void) => {
    const field = `${id}-${name}`;
    return (
      <div className="combo-series__row">
        <label htmlFor={field} className="combo-series__name">
          {name}
        </label>
        {horizontal ? (
          <input
            id={field}
            type="number"
            value={current}
            onChange={(event) => set(event.target.value)}
          />
        ) : category.kind === 'time' ? (
          <input
            id={field}
            type={dateInput(category.granularity)}
            value={current}
            onChange={(event) => set(event.target.value)}
          />
        ) : (
          <select
            id={field}
            className="select-sm"
            value={current === '' ? (category.members[0] ?? '') : current}
            onChange={(event) => set(event.target.value)}
          >
            {category.members.map((member) => (
              <option key={member} value={member}>
                {member}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  return (
    <form
      className="combo-reference-form"
      data-testid="reference-form"
      aria-label={kind === 'line' ? 'Reference line' : 'Reference band'}
      onSubmit={(event) => {
        event.preventDefault();
        if (why === undefined) onSubmit(reference);
      }}
      onKeyDown={(event) => {
        // Esc cancels it (design 20's keyboard table, rule 85).
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div className="combo-series__row" role="radiogroup" aria-label="Direction">
        <span className="combo-series__name">Direction</span>
        {(['horizontal', 'vertical'] as const).map((each) => (
          <label key={each}>
            <input
              type="radio"
              name={`${id}-direction`}
              checked={direction === each}
              onChange={() => {
                setDirection(each);
                setValue('');
                setFrom('');
                setTo('');
              }}
            />
            {each === 'horizontal' ? 'Horizontal' : 'Vertical'}
          </label>
        ))}
      </div>
      {horizontal ? (
        <div className="combo-series__row">
          <label htmlFor={`${id}-axis`} className="combo-series__name">
            Axis
          </label>
          <select
            id={`${id}-axis`}
            className="select-sm"
            value={axis}
            onChange={(event) => {
              setAxis(event.target.value as ComboAxis);
              setSeries(undefined);
            }}
          >
            {axes.map((one) => (
              <option key={one.axis} value={one.axis}>
                {AXIS_NAMES[one.axis]} · {one.measures.map((each) => each.title).join(' · ')}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {kind === 'line' && horizontal ? (
        <div className="combo-series__row">
          <label htmlFor={`${id}-source`} className="combo-series__name">
            Value
          </label>
          <select
            id={`${id}-source`}
            className="select-sm"
            value={source}
            onChange={(event) => setSource(event.target.value as 'fixed' | ReferenceStat)}
          >
            <option value="fixed">Fixed</option>
            {REFERENCE_STATS.map((stat) => (
              <option key={stat} value={stat}>
                {STAT_NAMES[stat]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {kind === 'band' ? (
        <>
          {valueField('From', from, setFrom)}
          {valueField('To', to, setTo)}
        </>
      ) : computed ? (
        <div className="combo-series__row">
          <label htmlFor={`${id}-series`} className="combo-series__name">
            Series
          </label>
          <select
            id={`${id}-series`}
            className="select-sm"
            value={chosenSeries ?? ''}
            onChange={(event) => setSeries(event.target.value)}
          >
            {onAxis.map((one) => (
              <option key={one.measure} value={one.measure}>
                {one.title}
              </option>
            ))}
          </select>
        </div>
      ) : (
        valueField(horizontal ? 'Value' : 'At', value, setValue)
      )}
      <div className="combo-series__row">
        <label htmlFor={`${id}-label`} className="combo-series__name">
          Label
        </label>
        <input
          id={`${id}-label`}
          type="text"
          value={label}
          required
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <label className="combo-series__row">
        <input
          type="checkbox"
          checked={showValue}
          onChange={(event) => setShowValue(event.target.checked)}
        />
        Show value
      </label>
      <div className="combo-series__row" role="radiogroup" aria-label="Label at">
        <span className="combo-series__name">Label at</span>
        {(['start', 'end'] as const).map((each) => (
          <label key={each}>
            <input
              type="radio"
              name={`${id}-label-at`}
              checked={labelAt === each}
              onChange={() => setLabelAt(each)}
            />
            {each === 'start' ? 'Start' : 'End'}
          </label>
        ))}
      </div>
      {why === undefined ? null : (
        <p className="panel-section__note" id={`${id}-why`} data-testid="reference-form-why">
          {why}
        </p>
      )}
      <div className="combo-reference-form__actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-sm"
          disabled={why !== undefined}
          {...(why === undefined ? {} : { 'aria-describedby': `${id}-why` })}
        >
          {initial === undefined ? 'Add' : 'Save'} {kind}
        </button>
      </div>
    </form>
  );
}
