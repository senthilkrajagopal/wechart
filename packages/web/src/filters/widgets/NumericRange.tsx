import type { FilterValue } from '../model';
import type { WidgetProps } from './props';

/** A number from an input, or undefined when it is empty or not a number. */
function numberFrom(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** A range, or no filter when neither end is set. */
function rangeOf(min: number | undefined, max: number | undefined): FilterValue | undefined {
  return min === undefined && max === undefined ? undefined : { kind: 'range', min, max };
}

/**
 * A numeric range (AC-076): a lowest and a highest value, either of which may
 * be left open.
 */
export function NumericRange({ label, value, onChange }: WidgetProps) {
  const min = value?.kind === 'range' ? value.min : undefined;
  const max = value?.kind === 'range' ? value.max : undefined;

  return (
    <fieldset className="filter-widget filter-widget--range">
      <legend className="filter-widget__label">{label}</legend>
      <input
        type="number"
        aria-label={`${label} from`}
        placeholder="From"
        value={min ?? ''}
        onChange={(event) => {
          onChange(rangeOf(numberFrom(event.target.value), max));
        }}
      />
      <input
        type="number"
        aria-label={`${label} to`}
        placeholder="To"
        value={max ?? ''}
        onChange={(event) => {
          onChange(rangeOf(min, numberFrom(event.target.value)));
        }}
      />
    </fieldset>
  );
}
