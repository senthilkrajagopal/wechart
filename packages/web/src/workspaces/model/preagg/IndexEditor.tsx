import { useEffect, useRef, useState } from 'react';

/**
 * An index's columns (T152, AC-146): in order, because the order is the
 * index's sort order in Cube Store (research/cube/pre-aggregations.md §1) —
 * so each is a row that moves up or down, rather than a list retyped, and the
 * columns are written in the order shown. Whether the index is aggregate is
 * the index's own Type, beside this.
 */
export function IndexColumns({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (next: string[] | undefined) => void;
}) {
  const columns =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.filter((each): each is string => typeof each === 'string')
        : [];
  const [adding, setAdding] = useState('');
  const named = adding.trim();
  const addable = named !== '' && !columns.includes(named);

  /**
   * Focus follows the column moved (T152's review): rows are positions, so
   * the button pressed would otherwise name — and move — the column that took
   * its place. At the top or the bottom, it goes to the way still open. The
   * move is said, as a tile's move is (direction.md, keyboard).
   */
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes once the moved columns are drawn: the parent redraws
  // this with them, so it is taken up after that render, not in the click.
  const following = useRef<{ at: number; way: 'up' | 'down' } | null>(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    const target = following.current;
    if (target === null) return;
    following.current = null;
    const { at, way } = target;
    const there = buttons.current.get(`${String(at)}:${way}`);
    const other = buttons.current.get(`${String(at)}:${way === 'up' ? 'down' : 'up'}`);
    (there !== undefined && !there.disabled ? there : other)?.focus();
  });

  const write = (next: string[]) => {
    onChange(next.length === 0 ? undefined : next);
  };
  const move = (from: number, to: number) => {
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    write(next);
    following.current = { at: to, way: to < from ? 'up' : 'down' };
    setSaid(`${moved} moved to position ${String(to + 1)} of ${String(next.length)}.`);
  };
  const add = () => {
    if (!addable) return;
    write([...columns, named]);
    setAdding('');
  };

  return (
    <div className="ordered-references">
      <ol className="ordered-references__list" aria-label="Columns">
        {columns.map((column, index) => (
          // Positions, not names: the same column may be listed twice while
          // being edited, and a move changes every position after it.
          <li key={index} className="ordered-references__row">
            <span className="ordered-references__name">{column}</span>
            <button
              type="button"
              className="btn-sm"
              aria-label={`Move ${column} up`}
              disabled={index === 0}
              ref={(node) => {
                if (node === null) buttons.current.delete(`${String(index)}:up`);
                else buttons.current.set(`${String(index)}:up`, node);
              }}
              onClick={() => {
                move(index, index - 1);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn-sm"
              aria-label={`Move ${column} down`}
              disabled={index === columns.length - 1}
              ref={(node) => {
                if (node === null) buttons.current.delete(`${String(index)}:down`);
                else buttons.current.set(`${String(index)}:down`, node);
              }}
              onClick={() => {
                move(index, index + 1);
              }}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn-sm"
              aria-label={`Remove ${column}`}
              onClick={() => {
                write(columns.filter((_, at) => at !== index));
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <span className="ordered-references__add">
        <input
          id={id}
          type="text"
          aria-label="Add a column"
          placeholder="member"
          value={adding}
          onChange={(event) => {
            setAdding(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        {/* Once only: an index lists a column once. */}
        <button type="button" className="btn-sm" onClick={add} disabled={!addable}>
          Add column
        </button>
      </span>
      <span className="visually-hidden" role="status">
        {said}
      </span>
    </div>
  );
}
