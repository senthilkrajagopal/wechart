import { useState } from 'react';

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

  const write = (next: string[]) => {
    onChange(next.length === 0 ? undefined : next);
  };
  const move = (from: number, to: number) => {
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    write(next);
  };
  const add = () => {
    const name = adding.trim();
    if (name === '') return;
    write([...columns, name]);
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
        <button type="button" className="btn-sm" onClick={add} disabled={adding.trim() === ''}>
          Add column
        </button>
      </span>
    </div>
  );
}
