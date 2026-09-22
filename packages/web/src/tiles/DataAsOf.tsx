/**
 * When a chart's data is from (T154, AC-148): Cube's `lastRefreshTime`, in
 * the viewer's own time, to the second — so a refresh visibly moves it on.
 * A badge in the tile's head, where the prototype's tile head carries its
 * data's age. Data not from today names its day too: a result Cube has kept
 * since yesterday would otherwise read as today's.
 */
export function DataAsOf({ at, now = new Date() }: { at: string; now?: Date }) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const today = when.toDateString() === now.toDateString();
  return (
    <time className="tile-as-of" data-testid="data-as-of" dateTime={when.toISOString()}>
      Data as of{' '}
      {when.toLocaleString(undefined, {
        ...(today ? {} : { month: 'short', day: 'numeric' }),
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })}
    </time>
  );
}
