import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useFocusTrap } from '../../shell/useFocusTrap';
import { useEscape } from './CloseTabDialog';

/** "a", "a and b", "a, b and c". */
const listOf = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;

/**
 * Save… (T812, AC-457, AC-483; design 17, I2): a name, required, unique to
 * its owner and at most 100 characters, and a description, optional and at
 * most 1,000, with what the save keeps said under them. The API judges the
 * name; a refusal's reason shows on the name and the dialog stays open.
 * Focus starts on the name; Esc and Cancel close it unsaved (rule 85).
 */
export function SaveDialog({
  name: startName = '',
  description: startDescription = '',
  sourceName,
  parameters,
  onSave,
  onCancel,
}: {
  /** Where it starts: Save as new…'s "(copy)". */
  readonly name?: string;
  readonly description?: string;
  /** The tab's data source, as its editor names it. */
  readonly sourceName: string;
  /** The tab's parameters' names, in order. */
  readonly parameters: readonly string[];
  /** Saves it: null once saved, or the refusal's reason. */
  readonly onSave: (name: string, description: string) => Promise<string | null>;
  readonly onCancel: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(startName);
  const [description, setDescription] = useState(startDescription);
  const [refused, setRefused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useFocusTrap(box);
  useEffect(() => nameField.current?.focus(), []);
  useEscape(onCancel);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const reason = await onSave(name, description);
    setSaving(false);
    setRefused(reason);
    if (reason !== null) nameField.current?.focus();
  };

  const keeps =
    parameters.length === 0
      ? `Keeps the SQL and ${sourceName}. Only you can see it.`
      : `Keeps the SQL, ${sourceName}, and ${listOf(parameters)} with their types and values. Only you can see it.`;
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="dialog sql-save"
      >
        <h2 id={`${ids}-title`}>Save query</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label className="sql-save__field" htmlFor={`${ids}-name`}>
            Name
          </label>
          <input
            id={`${ids}-name`}
            ref={nameField}
            className="sql-save__input"
            value={name}
            aria-invalid={refused !== null}
            aria-describedby={refused === null ? undefined : `${ids}-refused`}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          {refused === null ? null : (
            <p id={`${ids}-refused`} role="alert" className="sql-save__refused">
              {refused}
            </p>
          )}
          <label className="sql-save__field" htmlFor={`${ids}-description`}>
            Description · optional
          </label>
          <textarea
            id={`${ids}-description`}
            className="sql-save__input"
            rows={3}
            value={description}
            aria-describedby={`${ids}-count`}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
          <p id={`${ids}-count`} className="sql-save__count">
            {description.length.toLocaleString('en')} / 1,000
          </p>
          <p className="sql-save__keeps">{keeps}</p>
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
