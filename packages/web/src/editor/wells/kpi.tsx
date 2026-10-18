import {
  KPI_COMPARE_TO,
  KPI_DIRECTIONS,
  kpiOptionsOf,
  withKpiOptions,
  type KpiCompareTo,
  type KpiOptions,
  type TimeGranularity,
} from '@wechart/core';
import { useId, useState, type ReactNode } from 'react';

import type { TypeWellsProps } from './registry';

/**
 * The KPI's own wells (T936, AC-564; design 23 sheet 1), after Metrics:
 * Compare to, Target, Time, Tile by and Direction, all optional. Each is
 * kept in the chart's options under `kpi` (`withKpiOptions`), sparse, so a
 * KPI with none set saves and draws exactly as before.
 */

/** The grains a KPI's period and trend go by, as Cube names them. */
const TIME_GRAINS: readonly { readonly value: TimeGranularity; readonly label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

type CompareKind = KpiCompareTo['kind'] | 'none';
type TargetKind = 'none' | 'measure' | 'value';

function Well({
  id,
  label,
  name,
  highlighted,
  children,
}: {
  id: string;
  label: string;
  name: string;
  highlighted: boolean;
  children: ReactNode;
}) {
  return (
    <section className="well-field">
      <h3 id={id} className="well-field__label">
        {label}
      </h3>
      <div
        className="well well--settings"
        data-testid={`well-${name}`}
        data-highlight={highlighted ? 'true' : undefined}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * A number typed freely and set down on leaving the box or Enter, as Top N
 * is (AC-216): anything that isn't a finite number puts back what was there.
 */
function ValueBox({
  label,
  value,
  onValue,
}: {
  label: string;
  value: number | undefined;
  onValue: (value: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const commit = () => {
    if (typed === null) return;
    const number = Number(typed.trim());
    if (typed.trim() !== '' && Number.isFinite(number)) onValue(number);
    setTyped(null);
  };
  return (
    <input
      type="number"
      className="well__value"
      aria-label={label}
      value={typed ?? (value === undefined ? '' : String(value))}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

export function KpiWells({ highlight, available, options, onOptions, titleOf }: TypeWellsProps) {
  const ids = useId();
  const kpi = kpiOptionsOf(options);
  const set = (next: KpiOptions) => {
    onOptions({ kpi: withKpiOptions({}, next)['kpi'] });
  };
  const without = <K extends keyof KpiOptions>(key: K): KpiOptions => {
    const next = { ...kpi };
    delete next[key];
    return next;
  };

  const measures = available.filter((member) => member.kind === 'measure');
  const dimensions = available.filter((member) => member.kind === 'dimension');
  const times = available.filter((member) => member.kind === 'timeDimension');

  // A choice that needs a measure, a value or a grain is shown at once, and
  // stored once it has one. Only such a pending choice is held here: what is
  // stored is read from the options, so an undo shows what is left (T936's
  // review).
  const [compareKind, setCompareKind] = useState<CompareKind>('none');
  const [targetKind, setTargetKind] = useState<TargetKind>('none');
  const shownCompare: CompareKind =
    kpi.compareTo?.kind ??
    (compareKind === 'measure' || compareKind === 'value' ? compareKind : 'none');
  const shownTarget: TargetKind = kpi.target?.kind ?? (targetKind === 'value' ? 'value' : 'none');
  const [timeMember, setTimeMember] = useState<string>('');

  return (
    <>
      <Well id={`${ids}-compare`} label="Compare to" name="kpi-compareTo" highlighted={false}>
        <select
          aria-labelledby={`${ids}-compare`}
          value={shownCompare}
          onChange={(event) => {
            const kind = event.target.value as CompareKind;
            setCompareKind(kind);
            if (kind === 'previousPeriod' || kind === 'samePeriodLastYear') {
              set({ ...kpi, compareTo: { kind } });
            } else {
              set(without('compareTo'));
            }
          }}
        >
          {KPI_COMPARE_TO.map((choice) => (
            <option key={choice.kind} value={choice.kind}>
              {choice.label}
            </option>
          ))}
        </select>
        {shownCompare === 'measure' ? (
          <select
            aria-label="Compare to: measure"
            value={kpi.compareTo?.kind === 'measure' ? kpi.compareTo.member : ''}
            onChange={(event) => {
              const member = event.target.value;
              set(
                member === ''
                  ? without('compareTo')
                  : { ...kpi, compareTo: { kind: 'measure', member } },
              );
            }}
          >
            <option value="">Choose a measure</option>
            {measures.map((member) => (
              <option key={member.name} value={member.name}>
                {titleOf(member.name)}
              </option>
            ))}
          </select>
        ) : null}
        {shownCompare === 'value' ? (
          <ValueBox
            label="Compare to: value"
            value={kpi.compareTo?.kind === 'value' ? kpi.compareTo.value : undefined}
            onValue={(value) => set({ ...kpi, compareTo: { kind: 'value', value } })}
          />
        ) : null}
      </Well>

      <Well
        id={`${ids}-target`}
        label="Target"
        name="kpi-target"
        highlighted={highlight === 'target'}
      >
        <select
          aria-labelledby={`${ids}-target`}
          value={
            kpi.target?.kind === 'measure'
              ? kpi.target.member
              : shownTarget === 'value'
                ? 'value'
                : ''
          }
          onChange={(event) => {
            const chosen = event.target.value;
            if (chosen === 'value') {
              setTargetKind('value');
              set(without('target'));
            } else if (chosen === '') {
              setTargetKind('none');
              set(without('target'));
            } else {
              setTargetKind('measure');
              set({ ...kpi, target: { kind: 'measure', member: chosen } });
            }
          }}
        >
          <option value="">None</option>
          {measures.map((member) => (
            <option key={member.name} value={member.name}>
              {titleOf(member.name)}
            </option>
          ))}
          <option value="value">A value</option>
        </select>
        {shownTarget === 'value' ? (
          <ValueBox
            label="Target: value"
            value={kpi.target?.kind === 'value' ? kpi.target.value : undefined}
            onValue={(value) => set({ ...kpi, target: { kind: 'value', value } })}
          />
        ) : null}
      </Well>

      <Well id={`${ids}-time`} label="Time" name="kpi-time" highlighted={false}>
        <select
          aria-labelledby={`${ids}-time`}
          value={kpi.time?.member ?? timeMember}
          onChange={(event) => {
            const member = event.target.value;
            if (member === '') {
              setTimeMember('');
              set(without('time'));
            } else if (kpi.time !== undefined) {
              set({ ...kpi, time: { ...kpi.time, member } });
            } else {
              // Pending until a grain is chosen.
              setTimeMember(member);
            }
          }}
        >
          <option value="">None</option>
          {times.map((member) => (
            <option key={member.name} value={member.name}>
              {titleOf(member.name)}
            </option>
          ))}
        </select>
        <select
          aria-label="Time by"
          value={kpi.time?.granularity ?? ''}
          disabled={(kpi.time?.member ?? timeMember) === ''}
          onChange={(event) => {
            const member = kpi.time?.member ?? timeMember;
            const granularity = event.target.value as TimeGranularity | '';
            if (member === '' || granularity === '') set(without('time'));
            else set({ ...kpi, time: { member, granularity } });
            setTimeMember('');
          }}
        >
          <option value="">Choose a grain</option>
          {TIME_GRAINS.map((grain) => (
            <option key={grain.value} value={grain.value}>
              {grain.label}
            </option>
          ))}
        </select>
      </Well>

      <Well id={`${ids}-tile`} label="Tile by" name="kpi-tileBy" highlighted={false}>
        <select
          aria-labelledby={`${ids}-tile`}
          value={kpi.tileBy ?? ''}
          onChange={(event) => {
            const member = event.target.value;
            set(member === '' ? without('tileBy') : { ...kpi, tileBy: member });
          }}
        >
          <option value="">None</option>
          {dimensions.map((member) => (
            <option key={member.name} value={member.name}>
              {titleOf(member.name)}
            </option>
          ))}
        </select>
      </Well>

      <section className="well-field">
        <h3 id={`${ids}-direction`} className="well-field__label">
          Direction
        </h3>
        <div
          className="well well--settings"
          role="radiogroup"
          aria-labelledby={`${ids}-direction`}
          data-testid="well-kpi-direction"
        >
          {KPI_DIRECTIONS.map((choice) => (
            <label key={choice.value} className="well__choice">
              <input
                type="radio"
                name={`${ids}-direction`}
                value={choice.value}
                checked={kpi.direction === choice.value}
                onChange={() => set({ ...kpi, direction: choice.value })}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
