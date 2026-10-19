import { formatValue, type MemberFormats } from '@wechart/core';

import { kindOfFormat } from '../text/elements/shortNumbers';

/**
 * A figure beside a KPI's value, short to three significant digits as design
 * 23 sheet 1 writes them ("$1.32M", "$1.40M", "$450K"): money as money, a
 * percentage and anything under a thousand as its format writes it
 * (decision T938-1).
 */
export function kpiShort(
  value: number,
  member: string,
  formats: MemberFormats | undefined,
): string {
  const kind = kindOfFormat(member, formats);
  if (kind.kind === 'percent' || Math.abs(value) < 1000)
    return formatValue(value, member, formats ?? {});
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    minimumSignificantDigits: 3,
    maximumSignificantDigits: 3,
    ...(kind.kind === 'money' ? { style: 'currency', currency: kind.currency } : {}),
  }).format(value);
}
