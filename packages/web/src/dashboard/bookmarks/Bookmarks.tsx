import { useEffect, useId, useRef, useState } from 'react';

import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { StateLine } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import type { ViewState } from './viewState';

/**
 * The dashboard header's Bookmarks (T127, AC-121): Save bookmark… keeps what
 * the dashboard shows now — the page tab, the filters' values and the marks —
 * under a name the reader gives, beside the dashboard and never in it
 * (AC-122). The prototype has no bookmarks; the control sits in the header
 * with the dashboard's other reading controls, before its settings gear.
 */
export function Bookmarks({ dashboardId, current }: { dashboardId: string; current: ViewState }) {
  const [saving, setSaving] = useState<ViewState | undefined>(undefined);
  const [said, setSaid] = useState('');
  const trigger = useRef<HTMLSpanElement>(null);

  const items: MenuItem[] = [
    {
      key: 'save',
      label: 'Save bookmark…',
      onSelect: () => {
        setSaid('');
        // What the dashboard shows as it is chosen: the dialog is modal.
        setSaving(current);
      },
    },
  ];
  const close = () => {
    setSaving(undefined);
    trigger.current?.querySelector('button')?.focus();
  };

  return (
    <span ref={trigger} className="dashboard__bookmarks">
      <MenuButton label="Bookmarks" items={items} className="dashboard__bookmarks-button">
        Bookmarks <span aria-hidden="true">▾</span>
      </MenuButton>
      <span className="visually-hidden" role="status">
        {said}
      </span>
      {saving === undefined ? null : (
        <SaveBookmark
          dashboardId={dashboardId}
          state={saving}
          onSaved={(name) => {
            setSaid(`Saved the bookmark “${name}”.`);
            close();
          }}
          onClose={close}
        />
      )}
    </span>
  );
}

/** Save bookmark…'s dialog: a name, and what it keeps. */
function SaveBookmark({
  dashboardId,
  state,
  onSaved,
  onClose,
}: {
  dashboardId: string;
  state: ViewState;
  onSaved: (name: string) => void;
  onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useFocusTrap(box);
  const [name, setName] = useState('');
  const [run, setRun] = useState<
    { kind: 'idle' } | { kind: 'run' } | { kind: 'err'; text: string }
  >({ kind: 'idle' });

  // Escape closes it, as every dialog here closes; focus starts on the name.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    field.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const named = name.trim();
  const save = () => {
    if (named === '' || run.kind === 'run') return;
    setRun({ kind: 'run' });
    void fetch(`/api/dashboards/${encodeURIComponent(dashboardId)}/bookmarks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: named, state }),
    })
      .then(async (response) => {
        if (response.ok) {
          onSaved(named);
          return;
        }
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const why =
          typeof body?.error === 'string'
            ? body.error
            : `the server answered ${String(response.status)}.`;
        setRun({ kind: 'err', text: `The bookmark was not saved: ${why}` });
      })
      .catch(() => {
        setRun({ kind: 'err', text: 'The bookmark was not saved: the server did not answer.' });
      });
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog save-bookmark"
      >
        <h2 id={heading}>Save a bookmark</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="save-bookmark__name">
            Name
            <input
              ref={field}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <p className="save-bookmark__keeps">
            Keeps the page tab shown, the filters’ values and what is marked. A bookmark of the same
            name on this dashboard is replaced.
          </p>
          {run.kind === 'run' ? <StateLine kind="run">Saving…</StateLine> : null}
          {run.kind === 'err' ? <StateLine kind="err">{run.text}</StateLine> : null}
          <div className="dialog__actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={named === '' || run.kind === 'run'}
            >
              Save
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
