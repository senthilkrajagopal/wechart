import type { FilterValue } from './model';

/**
 * A filter in words, for a reader: what a tile that came back empty was
 * filtered by (AC-043). `title` is the field as the filter bar names it.
 */
export function describeFilter(title: string, value: FilterValue): string {
  switch (value.kind) {
    case 'values': {
      const picked = value.values;
      const listed =
        picked.length <= 1
          ? (picked[0] ?? '')
          : `${picked.slice(0, -1).join(', ')} or ${picked[picked.length - 1] ?? ''}`;
      return `${title} is ${listed}`;
    }
    case 'range':
      if (value.min !== undefined && value.max !== undefined)
        return `${title} from ${String(value.min)} to ${String(value.max)}`;
      return value.min !== undefined
        ? `${title} at least ${String(value.min)}`
        : `${title} at most ${String(value.max)}`;
    case 'preset':
      return `${title}: ${value.preset}`;
    case 'dates':
      if (value.from !== '' && value.to !== '') return `${title} from ${value.from} to ${value.to}`;
      return value.from !== ''
        ? `${title} on or after ${value.from}`
        : `${title} on or before ${value.to}`;
  }
}
