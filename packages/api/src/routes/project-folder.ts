/**
 * "Edit in my workspace"'s project folder (T523; AC-368, AC-369; design 14,
 * state G): each copy goes into a folder of its own in My workspace, named
 * `project-YYYY-MM-DD-HHmm` for the minute it is made in the user's time
 * zone, `-2`, then `-3`, where that name is taken, and described by what it
 * edits and where that came from.
 */
export const NO_TIME_ZONE =
  'Say the time zone its folder is named in: { timeZone }, as the browser names it.';

/** The time zone asked for, where it is one: an IANA name, as a browser gives it. */
export function timeZoneOf(asked: unknown): string | undefined {
  if (typeof asked !== 'string' || asked === '') return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: asked });
    return asked;
  } catch {
    return undefined;
  }
}

/** `project-2026-09-30-1430`: the minute `at` is in `timeZone`. */
export function projectName(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? '';
  return `project-${part('year').padStart(4, '0')}-${part('month')}-${part('day')}-${part('hour')}${part('minute')}`;
}

/** `name`, or `name-2`, `name-3`… where it is taken. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  let count = 2;
  while (taken.has(`${name}-${String(count)}`)) count += 1;
  return `${name}-${String(count)}`;
}

/** A description's limit, in characters as code points (AC-369). */
const LIMIT = 1000;

/**
 * "Editing Revenue overview from Sales / EMEA": the item's title and its
 * folder's path as the copy is made; the Shared root's "Shared". Never past
 * a description's limit, which a long title and a deep path could pass.
 */
export function editingText(title: string, path: readonly string[]): string {
  const text = `Editing ${title} from ${path.length === 0 ? 'Shared' : path.join(' / ')}`;
  const points = [...text];
  return points.length <= LIMIT ? text : `${points.slice(0, LIMIT - 1).join('')}…`;
}
