import { useId } from 'react';

import { DATE_PRESETS, type DatePreset } from '../model';
import type { WidgetProps } from './props';

/**
 * A date range with presets (AC-076). The presets are relative — "last 30
 * days" is sent to Cube as those words, so the range moves with the calendar
 * (AC-083) — and "Between dates" takes two fixed dates.
 */
export function DateRange({ label, value, onChange }: WidgetProps) {
  const range = useId();
  const from = useId();
  const to = useId();
  const chosen = value?.kind === 'preset' ? value.preset : value?.kind === 'dates' ? 'dates' : '';

  return (
    <span className="filter-widget filter-widget--date">
      <label htmlFor={range} className="filter-widget__label">
        {label}
      </label>
      <select
        id={range}
        value={chosen}
        onChange={(event) => {
          const next = event.target.value;
          if (next === '') onChange(undefined);
          else if (next === 'dates') onChange({ kind: 'dates', from: '', to: '' });
          else onChange({ kind: 'preset', preset: next as DatePreset });
        }}
      >
        <option value="">All time</option>
        {DATE_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {preset[0]?.toUpperCase()}
            {preset.slice(1)}
          </option>
        ))}
        <option value="dates">Between dates…</option>
      </select>
      {value?.kind === 'dates' ? (
        <>
          <label htmlFor={from}>From</label>
          <input
            id={from}
            type="date"
            value={value.from}
            onChange={(event) => {
              onChange({ kind: 'dates', from: event.target.value, to: value.to });
            }}
          />
          <label htmlFor={to}>To</label>
          <input
            id={to}
            type="date"
            value={value.to}
            onChange={(event) => {
              onChange({ kind: 'dates', from: value.from, to: event.target.value });
            }}
          />
        </>
      ) : null}
    </span>
  );
}
