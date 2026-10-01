import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { announcementOf } from './ProposeDialog';

/**
 * A folder's description under its name in Explore's header (T524, AC-369;
 * design 14, state H): two lines, More for a longer one; Edit beside it, or
 * Add a description where there is none, for one who may change the folder;
 * nothing at all for a reader of a folder with none.
 *
 * Edited in place, as the heading's Rename is, never in a dialog: a textarea
 * with ProposeDialog's "n / 1,000" counter, counted in code points as the
 * API counts them, which never cuts, and holds Save past 1,000. ⌘ or Ctrl
 * Enter saves; Escape puts the text back.
 */
export const DESCRIPTION_LIMIT = 1000;

const count = new Intl.NumberFormat('en');

export function FolderDescription({
  folderTitle,
  description,
  mayEdit,
  onSave,
}: {
  readonly folderTitle: string;
  readonly description: string | null | undefined;
  readonly mayEdit: boolean;
  /** Saves it; throws, saying why, where it isn't saved. */
  readonly onSave: (text: string) => Promise<unknown>;
}) {
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const text = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  /** Focus back on Edit once the field has gone. */
  const backToEdit = useRef(false);
  const shown = description?.trim() ? description : null;

  // A new text opens clamped again (T524's review).
  const [measuredFor, setMeasuredFor] = useState(shown);
  if (measuredFor !== shown) {
    setMeasuredFor(shown);
    setExpanded(false);
  }
  // Whether two lines hold it, measured as drawn, and again as its column
  // narrows or widens (a docked pane opening): More only where they don't.
  useLayoutEffect(() => {
    const element = text.current;
    if (element === null || expanded) return undefined;
    const measure = () => {
      setClamped(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [shown, expanded, editing]);

  useEffect(() => {
    if (!editing) {
      if (backToEdit.current) {
        backToEdit.current = false;
        editButton.current?.focus();
      }
      return;
    }
    // The field takes focus with its text selected (design 14, keyboard).
    field.current?.focus();
    field.current?.select();
  }, [editing]);

  const length = [...draft].length;
  const over = length > DESCRIPTION_LIMIT;
  // Said politely, and only at 900, 1,000 and past it, as ProposeDialog's is.
  const band = over ? 'over' : length >= 900 ? String(length >= DESCRIPTION_LIMIT) : '';
  const [lastBand, setLastBand] = useState(band);
  const [announced, setAnnounced] = useState('');
  if (band !== lastBand) {
    setLastBand(band);
    setAnnounced(announcementOf(length));
  }

  const begin = () => {
    setDraft(shown ?? '');
    setFailed(null);
    setEditing(true);
  };
  const cancel = () => {
    backToEdit.current = true;
    setEditing(false);
    setFailed(null);
  };
  const save = async () => {
    if (over || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSave(draft);
      backToEdit.current = true;
      setEditing(false);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  if (editing)
    return (
      <div className="folder-description folder-description--editing">
        <div className="folder-description__top">
          <label htmlFor={`${ids}-text`}>Description</label>
          <span
            id={`${ids}-count`}
            className={`folder-description__counter${over ? ' is-over' : ''}`}
          >
            {count.format(length)} / 1,000
          </span>
        </div>
        <textarea
          id={`${ids}-text`}
          ref={field}
          rows={3}
          value={draft}
          aria-label={`Description of ${folderTitle}`}
          aria-describedby={over ? `${ids}-count ${ids}-over` : `${ids}-count`}
          aria-invalid={over}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void save();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancel();
            }
          }}
        />
        {over ? (
          <p id={`${ids}-over`} className="folder-description__over">
            <StatusIcon kind="err" />
            Shorten to 1,000 characters.
          </p>
        ) : null}
        {failed === null ? null : <StateLine kind="err">{failed}</StateLine>}
        <div className="folder-description__bar">
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={over || saving}
            onClick={() => void save()}
          >
            Save
          </button>
          <button type="button" className="btn-sm" onClick={cancel}>
            Cancel
          </button>
          <span className="folder-description__keys">
            <kbd>⌘</kbd> <kbd>Enter</kbd> saves · <kbd>Esc</kbd> cancels
          </span>
        </div>
        <p className="visually-hidden" aria-live="polite">
          {announced}
        </p>
      </div>
    );

  if (shown === null)
    return mayEdit ? (
      <button
        ref={editButton}
        type="button"
        className="btn-link folder-description__add"
        onClick={begin}
      >
        <span aria-hidden="true">＋ </span>Add a description
      </button>
    ) : null;

  return (
    <div className="folder-description">
      <span
        ref={text}
        className={expanded ? 'folder-description__text' : 'folder-description__text is-clamped'}
      >
        {shown}
      </span>
      {clamped || expanded ? (
        <button
          type="button"
          className="btn-link"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((was) => !was);
          }}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
      {mayEdit ? (
        <button
          ref={editButton}
          type="button"
          className="btn-link"
          aria-label="Edit description"
          onClick={begin}
        >
          Edit
        </button>
      ) : null}
    </div>
  );
}
