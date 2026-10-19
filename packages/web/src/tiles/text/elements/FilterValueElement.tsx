import type { FilterValue } from '../../../filters/model';

/** A field's title as a plural, lower case: "Country" → "countries". */
function pluralOf(title: string): string {
  const words = title.trim().toLowerCase();
  if (/[^aeiou]y$/.test(words)) return `${words.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(words)) return `${words}es`;
  return `${words}s`;
}

/**
 * What a dashboard filter is set to, in words (T886, AC-522; design 21 pin
 * 10, state C6): its values, its range or its dates; while it's unset, that
 * every value is in — "all countries" — never nothing.
 */
export function filterValueWords(value: FilterValue | undefined, title: string): string {
  const all = `all ${pluralOf(title)}`;
  if (value === undefined) return all;
  switch (value.kind) {
    case 'values':
      return value.values.length === 0 ? all : value.values.join(', ');
    case 'range':
      if (value.min !== undefined && value.max !== undefined)
        return `${String(value.min)} to ${String(value.max)}`;
      if (value.min !== undefined) return `at least ${String(value.min)}`;
      if (value.max !== undefined) return `at most ${String(value.max)}`;
      return all;
    case 'preset':
      return value.preset;
    case 'dates':
      if (value.from !== '' && value.to !== '') return `${value.from} to ${value.to}`;
      if (value.from !== '') return `from ${value.from}`;
      if (value.to !== '') return `to ${value.to}`;
      return all;
    case 'cube':
      return value.words === '' ? all : value.words;
    default:
      return all;
  }
}

/** A Filter value as read: words in the sentence. */
export function FilterValueText({ words }: { readonly words: string }) {
  return <span className="text-value">{words}</span>;
}
