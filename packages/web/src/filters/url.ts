import { DATE_PRESETS, valueKeyOf, type FilterValue, type FilterValues } from './model';

/**
 * Filter values in the dashboard's URL (AC-081), so opening the URL reproduces
 * them. Written as a list — which filter, on which field, holding what — under
 * the `filters` search parameter; the router writes it as JSON and parses it
 * back (docs/research/router-search-history.md, Q1).
 *
 * A URL is typed, pasted and edited by hand, so what it says is checked
 * value by value and anything that is not a value is dropped, never trusted.
 */
export interface SearchFilter {
  readonly id: string;
  readonly member: string;
  readonly value: FilterValue;
}

/** Whether two sets of values say the same, whatever order they were set in. */
export function sameValues(a: FilterValues, b: FilterValues): boolean {
  const canonical = (values: FilterValues) =>
    JSON.stringify(Object.entries(values).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  return canonical(a) === canonical(b);
}

/** The values as the URL carries them, or nothing when none is set. */
export function valuesToSearch(values: FilterValues): SearchFilter[] | undefined {
  const entries = Object.entries(values).flatMap(([key, value]) => {
    // `valueKeyOf`: the filter's id, a space, the field. Neither has a space.
    const space = key.indexOf(' ');
    const member = key.slice(space + 1);
    return space < 1 || member === '' ? [] : [{ id: key.slice(0, space), member, value }];
  });
  return entries.length === 0 ? undefined : entries;
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrOpen = (raw: unknown): raw is string =>
  typeof raw === 'string' && (raw === '' || DATE.test(raw));
const numberOrOpen = (raw: unknown): raw is number | undefined =>
  raw === undefined || (typeof raw === 'number' && Number.isFinite(raw));

/** A filter value, if that is what this is. */
function valueFrom(raw: unknown): FilterValue | undefined {
  if (!isRecord(raw)) return undefined;
  switch (raw['kind']) {
    case 'preset': {
      const preset = DATE_PRESETS.find((each) => each === raw['preset']);
      return preset === undefined ? undefined : { kind: 'preset', preset };
    }
    case 'dates':
      return dateOrOpen(raw['from']) && dateOrOpen(raw['to'])
        ? { kind: 'dates', from: raw['from'], to: raw['to'] }
        : undefined;
    case 'values': {
      const values = raw['values'];
      return Array.isArray(values) && values.every((each) => typeof each === 'string')
        ? { kind: 'values', values: values as string[] }
        : undefined;
    }
    case 'range': {
      const { min, max } = raw;
      if (!numberOrOpen(min) || !numberOrOpen(max)) return undefined;
      return {
        kind: 'range',
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      };
    }
    default:
      return undefined;
  }
}

/** The values the URL carries, each checked; anything else dropped. */
export function valuesFromSearch(raw: unknown): FilterValues {
  if (!Array.isArray(raw)) return {};
  const values: Record<string, FilterValue> = {};
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { id, member } = entry;
    const value = valueFrom(entry['value']);
    if (typeof id !== 'string' || id === '' || id.includes(' ')) continue;
    if (typeof member !== 'string' || member === '' || value === undefined) continue;
    values[valueKeyOf({ id, widget: 'list', member })] = value;
  }
  return values;
}
