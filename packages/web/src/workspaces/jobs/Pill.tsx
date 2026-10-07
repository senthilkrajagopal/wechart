import { useId, type ReactNode } from 'react';

/**
 * A filter pill: its name and a native select, as the audit trail's (design
 * 08) and Run history's (T374). Jobs' Status and State filters and Schedules'
 * State filter wear it too (T558, R66).
 */
export function Pill({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <span className="select-pill">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </span>
  );
}

/** A pill of one choice among `choices`, '' for Any. */
export function ChoicePill<Value extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly (readonly [Value | '', string])[];
  value: Value | '';
  onChange: (value: Value | '') => void;
}) {
  return (
    <Pill label={label}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value as Value | '');
          }}
        >
          {choices.map(([choice, words]) => (
            <option key={choice} value={choice}>
              {words}
            </option>
          ))}
        </select>
      )}
    </Pill>
  );
}
