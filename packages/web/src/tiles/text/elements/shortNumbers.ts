import { formatValue, type MemberFormats } from '@wechart/core';

/** What kind of number a member's model format makes it: money, a percentage, or plain. */
export function kindOfFormat(
  member: string,
  formats: MemberFormats | undefined,
): { readonly kind: 'money'; readonly currency: string } | { readonly kind: 'percent' | 'plain' } {
  const format = formats?.[member];
  const named = typeof format === 'string' ? format : format?.name;
  const specifier = typeof format === 'string' ? undefined : format?.specifier;
  const currency = typeof format === 'object' ? format.currency : undefined;
  if (named === 'percent' || specifier?.includes('%') === true) return { kind: 'percent' };
  if (
    named?.startsWith('currency') === true ||
    currency !== undefined ||
    specifier?.startsWith('$') === true
  )
    return { kind: 'money', currency: currency ?? 'USD' };
  return { kind: 'plain' };
}

const UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
] as const;

const DIGITS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function symbolOf(currency: string): string {
  try {
    return (
      new Intl.NumberFormat('en-US', { style: 'currency', currency })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/**
 * Numbers as a headline writes them, all on one scale so they compare at a
 * glance: "$1.0M", "$1.27M", "$0.95M" (T885; decision T885-1). A
 * percentage is written as its model writes it, and numbers under a
 * thousand as their format writes them.
 */
export function shortValues(
  values: readonly number[],
  member: string,
  formats: MemberFormats | undefined,
): string[] {
  const kind = kindOfFormat(member, formats);
  const largest = Math.max(0, ...values.map((value) => Math.abs(value)));
  const unit = UNITS.find(([size]) => largest >= size);
  if (kind.kind === 'percent' || unit === undefined)
    return values.map((value) => formatValue(value, member, formats));
  const [size, suffix] = unit;
  const prefix = kind.kind === 'money' ? symbolOf(kind.currency) : '';
  return values.map((value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}${prefix}${DIGITS.format(Math.abs(value) / size)}${suffix}`;
  });
}
