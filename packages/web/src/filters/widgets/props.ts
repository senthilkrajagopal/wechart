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
  /**
   * What the reader has typed to search for, handed on to be asked of Cube:
   * the options are capped, and a value past the cap is found only there.
   */
  readonly onSearch?: ((text: string) => void) | undefined;
  /** The options stop at the cap: there are more than are listed. */
  readonly cutShort?: boolean | undefined;
  /**
   * How many values the member has in all, as Cube counted them (`total`;
   * T893, AC-529): said beside a list cut short, and after a search's matches.
   */
  readonly total?: number | undefined;
  /** How many values contain what was searched for, as Cube counted them (T893). */
  readonly matches?: number | undefined;
  /** What the values are, as a plural: "customers" (T893). */
  readonly noun?: string | undefined;
}

/** The picked values, when the value is a pick of values. */
export function pickedOf(value: FilterValue | undefined): readonly string[] {
  return value?.kind === 'values' ? value.values : [];
}

/** A pick of values, or no filter when nothing is picked. */
export function picked(values: readonly string[]): FilterValue | undefined {
  return values.length === 0 ? undefined : { kind: 'values', values };
}
