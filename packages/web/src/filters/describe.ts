import type { FilterValue, FilterWidget } from './model';

/**
 * A filter's value as its pill shows it, after the field's name (AC-187, the
 * prototype's "Category: all"): short, and never the value's full list.
 */
export function summaryOf(widget: FilterWidget, value: FilterValue | undefined): string {
  if (value === undefined) return widget === 'dateRange' ? 'All time' : 'All';
  switch (value.kind) {
    case 'preset':
      return `${value.preset.charAt(0).toUpperCase()}${value.preset.slice(1)}`;
    case 'dates':
      if (value.from !== '' && value.to !== '') return `${value.from} – ${value.to}`;
      if (value.from !== '') return `From ${value.from}`;
      return value.to === '' ? 'Between dates' : `To ${value.to}`;
    case 'values': {
      const [first, second, ...rest] = value.values;
      const shown = [first, second].filter((each) => each !== undefined).join(', ');
      return rest.length === 0 ? shown : `${shown} +${String(rest.length)}`;
    }
    case 'range':
      if (value.min !== undefined && value.max !== undefined)
        return `${String(value.min)} – ${String(value.max)}`;
      return value.min !== undefined ? `≥ ${String(value.min)}` : `≤ ${String(value.max)}`;
  }
}

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
