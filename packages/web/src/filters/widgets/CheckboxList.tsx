import { CutShort } from './CutShort';
import { picked, pickedOf, type ValuesWidgetProps } from './props';

/**
 * A checkbox list (AC-076): every value of the member, ticked to keep — for a
 * member with few values, where each should be seen at once. One with more
 * than the cap says so; a list with search is the widget for such a member.
 */
export function CheckboxList({ label, options, value, onChange, cutShort }: ValuesWidgetProps) {
  const chosen = pickedOf(value);

  return (
    <fieldset className="filter-widget filter-widget--checkbox">
      <legend className="filter-widget__label">{label}</legend>
      {options.map((option) => (
        <label key={option}>
          <input
            type="checkbox"
            checked={chosen.includes(option)}
            onChange={(event) => {
              onChange(
                picked(
                  event.target.checked
                    ? [...chosen, option]
                    : chosen.filter((each) => each !== option),
                ),
              );
            }}
          />
          {option}
        </label>
      ))}
      {cutShort === true ? <CutShort search={false} /> : null}
    </fieldset>
  );
}
