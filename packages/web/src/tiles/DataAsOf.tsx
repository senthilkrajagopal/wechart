/**
 * When a chart's data is from (T154, AC-148): Cube's `lastRefreshTime`, in
 * the viewer's own time, to the second — so a refresh visibly moves it on.
 * A badge in the tile's head, where the prototype's tile head carries its
 * data's age. Data not from today names its day too: a result Cube has kept
 * since yesterday would otherwise read as today's.
 *
 * Shown as "as of 10:32:18 PM", so a half-width tile keeps room for its title
 * (T014's review); the whole sentence is its text for a screen reader, and
 * its tooltip.
 */
export function DataAsOf({ at, now = new Date() }: { at: string; now?: Date }) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const today = when.toDateString() === now.toDateString();
  const shown = when.toLocaleString(undefined, {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <time
      className="tile-as-of"
      data-testid="data-as-of"
      dateTime={when.toISOString()}
      title={`Data as of ${shown}`}
    >
      <span className="visually-hidden">Data </span>as of {shown}
    </time>
  );
}
