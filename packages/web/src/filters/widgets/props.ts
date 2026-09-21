import type { FilterValue } from '../model';

/**
 * Every filter widget is controlled: it shows the value it is given and
 * reports the value the user makes — `undefined` meaning "no filter", so
 * clearing a widget is the same as never having set it (AC-080).
 */
export interface WidgetProps {
  /** The filter's name, which labels its control. */
  readonly label: string;
  readonly value: FilterValue | undefined;
  readonly onChange: (value: FilterValue | undefined) => void;
}

/** A widget that picks from the member's values, fetched from Cube. */
export interface ValuesWidgetProps extends WidgetProps {
  readonly options: readonly string[];
}

/** The picked values, when the value is a pick of values. */
export function pickedOf(value: FilterValue | undefined): readonly string[] {
  return value?.kind === 'values' ? value.values : [];
}

/** A pick of values, or no filter when nothing is picked. */
export function picked(values: readonly string[]): FilterValue | undefined {
  return values.length === 0 ? undefined : { kind: 'values', values };
}
