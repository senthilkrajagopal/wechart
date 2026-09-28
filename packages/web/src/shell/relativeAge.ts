/**
 * How long ago, as design 01's health column writes it: "45 s ago",
 * "25 min ago", "2 h ago", "3 d ago", "2 w ago" (item 9; T490's review).
 */
export function shortAgo(then: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  const units: [number, string][] = [
    [7 * 24 * 3600, 'w'],
    [24 * 3600, 'd'],
    [3600, 'h'],
    [60, 'min'],
  ];
  for (const [size, unit] of units)
    if (seconds >= size) return `${String(Math.round(seconds / size))} ${unit} ago`;
  return `${String(seconds)} s ago`;
}

/**
 * How long ago, in words: "40 minutes ago", "3 hours ago" — the acceleration
 * badge's (T158). The absolute time goes beside it, or in its title, so
 * nothing is only relative.
 */
export function relativeAge(then: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  // Each pair is "once this many of the current unit have passed, divide and
  // call the result the next unit up": 2,400 seconds is 40 minutes.
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
  ];

  let value = seconds;
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [size, nextUnit] of units) {
    if (Math.abs(value) < size) break;
    value = Math.round(value / size);
    unit = nextUnit;
  }

  return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-value, unit);
}
