/**
 * When a chart's data is from (T154, AC-148): Cube's `lastRefreshTime`, in
 * the viewer's own time, to the second — so a refresh visibly moves it on.
 * A badge in the tile's head, where the prototype's tile head carries its
 * data's age.
 */
export function DataAsOf({ at }: { at: string }) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  return (
    <time className="tile-as-of" data-testid="data-as-of" dateTime={when.toISOString()}>
      Data as of{' '}
      {when.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })}
    </time>
  );
}
