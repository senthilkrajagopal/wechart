/**
 * Shown under a list of values that stops at the cap, so a reader who does
 * not find a value knows the list is not the whole of it.
 */
export function CutShort({ search }: { search: boolean }) {
  return (
    <p className="filter-widget__cut" data-testid="filter-options-cut">
      Showing the first 1,000 values.{search ? ' Search to find others.' : ''}
    </p>
  );
}
