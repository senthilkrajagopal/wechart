import { picked, pickedOf, type ValuesWidgetProps } from './props';

/**
 * A checkbox list (AC-076): every value of the member, ticked to keep — for a
 * member with few values, where each should be seen at once.
 */
export function CheckboxList({ label, options, value, onChange }: ValuesWidgetProps) {
  const chosen = pickedOf(value);

  return (
    <fieldset className="filter-widget filter-widget--checkbox">
      <legend>{label}</legend>
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
    </fieldset>
  );
}
