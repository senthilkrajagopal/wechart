/**
 * A pre-aggregation's partition by its period (research cube/system-partitions.md,
 * "Derivation of partitions"), as Jobs, Run history and the audit trail say
 * it (T374; T505; design 16, B1 and I): one function for the page and the API.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A partition by its start, a UTC wall-clock `YYYY-MM-DDTHH:mm:ss.SSS`, as
 * its granularity names it: "Aug 2026", "29 Sep 2026", "Q3 2026", "Week of
 * 28 Sep 2026", "2026", "29 Sep 2026, 14:00".
 */
export function periodOf(start: string, granularity: string | null): string {
  const [date = '', time = ''] = start.split('T');
  const [year = '', month = '01', day = '01'] = date.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? month;
  const dayName = `${String(Number(day))} ${monthName} ${year}`;
  switch (granularity) {
    case 'year':
      return year;
    case 'quarter':
      return `Q${String(Math.floor((Number(month) - 1) / 3) + 1)} ${year}`;
    case 'month':
      return `${monthName} ${year}`;
    case 'week':
      return `Week of ${dayName}`;
    case 'hour':
    case 'minute':
      return `${dayName}, ${time.slice(0, 5)}`;
    default:
      return dayName;
  }
}

/** Several partitions, in the order asked: months of one year say the year once ("Sep, Aug 2026", design 16, B1). */
export function periodsOf(starts: readonly string[], granularity: string | null): string {
  const years = new Set(starts.map((start) => start.slice(0, 4)));
  if (granularity === 'month' && years.size === 1)
    return `${starts.map((start) => MONTHS[Number(start.slice(5, 7)) - 1] ?? '').join(', ')} ${[...years][0]!}`;
  return starts.map((start) => periodOf(start, granularity)).join(', ');
}
