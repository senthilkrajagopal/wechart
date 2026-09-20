import { PALETTE, type PaletteId } from '../model/insert';

/**
 * The element palette, in the edit sidebar's Add panel (AC-058).
 *
 * Every entry says what it is and what it does, because the difference
 * between "Chart" and "Chart from folders" is the whole of direction.md's
 * chart-ownership model — one belongs to this dashboard alone, the other
 * stays linked to a shared chart — and a list of bare names would not
 * convey it.
 */
export interface AddPanelProps {
  /** Where the next element will land, in words, so the click is not a guess. */
  readonly destination: string;
  /**
   * Something the last insert did that was not asked for — a tab group
   * wrapped in a section (AC-059). Empty when there is nothing to explain.
   */
  readonly message?: string | undefined;
  readonly onAdd: (id: PaletteId) => void;
}

export function AddPanel({ destination, message, onAdd }: AddPanelProps) {
  return (
    <div className="add-panel">
      <p className="add-panel__destination" data-testid="add-destination">
        Adds to {destination}.
      </p>

      {message === undefined || message === '' ? null : (
        // A live region: the section appears without being asked for, and a
        // reader who is not looking at the sidebar would otherwise never know.
        <p className="add-panel__message" role="status" data-testid="add-message">
          {message}
        </p>
      )}

      <ul aria-label="Elements to add">
        {PALETTE.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              data-testid={`add-${entry.id}`}
              onClick={() => {
                onAdd(entry.id);
              }}
            >
              <span className="add-panel__label">{entry.label}</span>
              <span className="add-panel__hint">{entry.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
