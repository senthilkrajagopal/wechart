/** The months as design 10 writes them ("22 Sep"), not as a locale might ("Sept"). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The date a bookmark was first saved, as its row says it (T742; design 10,
 * state B; design-10-Q2): "today", else the day first, "22 Sep", with the
 * year where it isn't this one (the coordinator's call, T742-1). In the
 * reader's local time, as their day is. Nothing for a date it can't read.
 */
export function savedOn(iso: string, now: Date = new Date()): string | undefined {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  const sameYear = at.getFullYear() === now.getFullYear();
  if (sameYear && at.getMonth() === now.getMonth() && at.getDate() === now.getDate())
    return 'today';
  const day = `${String(at.getDate())} ${MONTHS[at.getMonth()] ?? ''}`;
  return sameYear ? day : `${day} ${String(at.getFullYear())}`;
}
