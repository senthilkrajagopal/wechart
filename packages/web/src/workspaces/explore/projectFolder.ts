/**
 * "Edit in my workspace"'s project folder (T523, AC-368; design 14, state
 * G): the API names it `project-YYYY-MM-DD-HHmm` for the minute the copy is
 * made in the user's time zone, which the browser gives it.
 */

/** The browser's time zone, an IANA name such as "Europe/Berlin". */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** `project-2026-09-30-1430`: the minute `at` is in the browser's time zone. */
export function projectNameAt(at: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `project-${String(at.getFullYear()).padStart(4, '0')}-${two(at.getMonth() + 1)}-${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`;
}
