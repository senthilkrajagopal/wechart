import { useId, useState } from 'react';

export type AccessLevel = 'readWrite' | 'readOnly';

/**
 * The Access panel's group picker (T330; direction.md rule 64): labelled "AD
 * group", suggesting the editor's own groups and those already set on folders
 * they can see, and naming groups only, never a person (AC-259).
 */
export function GroupCombobox({
  suggestions,
  onAdd,
}: {
  readonly suggestions: readonly string[];
  readonly onAdd: (group: string, level: AccessLevel) => void;
}) {
  const [group, setGroup] = useState('');
  const [level, setLevel] = useState<AccessLevel>('readWrite');
  const id = useId();
  const named = group.trim();

  return (
    <form
      className="access-picker"
      onSubmit={(event) => {
        event.preventDefault();
        if (named === '') return;
        onAdd(named, level);
        setGroup('');
      }}
    >
      <label htmlFor={`${id}-group`}>AD group</label>
      <input
        id={`${id}-group`}
        list={`${id}-suggestions`}
        value={group}
        autoComplete="off"
        onChange={(event) => setGroup(event.target.value)}
      />
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <label htmlFor={`${id}-level`}>Access</label>
      <select
        id={`${id}-level`}
        value={level}
        onChange={(event) => setLevel(event.target.value as AccessLevel)}
      >
        <option value="readWrite">Read-write</option>
        <option value="readOnly">Read-only</option>
      </select>
      <button type="submit" className="btn-sm" disabled={named === ''}>
        Add
      </button>
    </form>
  );
}
