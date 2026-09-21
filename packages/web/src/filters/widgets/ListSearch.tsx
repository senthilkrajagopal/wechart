import { useState } from 'react';

import { picked, pickedOf, type ValuesWidgetProps } from './props';

/**
 * A list with search (AC-076): the member's values, narrowed by what is
 * typed, each a toggle. For a member with many values, where a checkbox list
 * would be a wall.
 */
export function ListSearch({ label, options, value, onChange }: ValuesWidgetProps) {
  const [search, setSearch] = useState('');
  const chosen = pickedOf(value);
  const shown = options.filter((option) =>
    option.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <span className="filter-widget filter-widget--list">
      <input
        type="search"
        aria-label={`Search ${label}`}
        placeholder={`Search ${label}`}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <span role="group" aria-label={label} className="filter-widget__options">
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
    </span>
  );
}
