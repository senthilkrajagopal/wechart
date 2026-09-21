import { useState } from 'react';

import { CutShort } from './CutShort';
import { picked, pickedOf, type ValuesWidgetProps } from './props';

/**
 * A list with search (AC-076): the member's values, narrowed by what is
 * typed, each a toggle. For a member with many values, where a checkbox list
 * would be a wall.
 *
 * What is typed narrows the values already here at once, and is handed on to
 * be asked of Cube — the values arrive capped, and one past the cap can only
 * be found there.
 */
export function ListSearch({
  label,
  options,
  value,
  onChange,
  onSearch,
  cutShort,
}: ValuesWidgetProps) {
  const [search, setSearch] = useState('');
  const chosen = pickedOf(value);
  const shown = options.filter((option) =>
    option.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <fieldset className="filter-widget filter-widget--list">
      <legend className="filter-widget__label">{label}</legend>
      <input
        type="search"
        aria-label={`Search ${label}`}
        placeholder="Search…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onSearch?.(event.target.value);
        }}
      />
      <span className="filter-widget__options">
        {shown.map((option) => {
          const on = chosen.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onChange(
                  picked(on ? chosen.filter((each) => each !== option) : [...chosen, option]),
                );
              }}
            >
              {option}
            </button>
          );
        })}
      </span>
      {cutShort === true ? <CutShort search /> : null}
    </fieldset>
  );
}
