import type { RenderSpec } from '@wechart/core';

/** Whether a measure's model format is money: its name, a currency, or a "$" specifier. */
export function moneyOf(format: unknown): { currency: string } | undefined {
  if (typeof format === 'string')
    return format.startsWith('currency') ? { currency: 'USD' } : undefined;
  if (typeof format !== 'object' || format === null) return undefined;
  const { currency, specifier } = format as { currency?: unknown; specifier?: unknown };
  if (typeof currency === 'string') return { currency };
  return typeof specifier === 'string' && specifier.startsWith('$')
    ? { currency: 'USD' }
    : undefined;
}

/**
 * A measure's amounts as a sentence writes them (T989, T988): compact, to
 * three significant figures, in the measure's currency where its model
 * format is money — "$1.35M", "$96K".
 */
export function compactWriter(spec: RenderSpec, measure: string): (value: number) => string {
  const money = moneyOf(spec.formats?.[measure]);
  const short = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumSignificantDigits: 3,
    ...(money === undefined ? {} : { style: 'currency', currency: money.currency }),
  });
  return (value) => short.format(value);
}
