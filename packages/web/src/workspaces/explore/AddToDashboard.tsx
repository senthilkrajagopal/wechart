import { useEffect, useId, useRef, useState } from 'react';

/** A dashboard the chart may be added to, with the folder it is in. */
export interface DashboardChoice {
  readonly id: string;
  readonly title: string;
  /** Its folder's name: "My workspace", or the project folder it is in. */
  readonly folder: string;
}

/**
 * "＋ Add to a dashboard…" (T686, DSH-16; design 06 pin 4 and state B; the
 * prototype's picker): a 24 px button opening a popover that finds a
 * dashboard by name, each a row with ▦, its name and its folder. Choosing one
 * adds the chart there and puts the picker away.
 *
 * The keyboard as every popover here has it (R75; the coordinator's call):
 * the field takes focus as it opens, Tab steps through the rows, and Escape
 * puts it away with focus back on the button. A press outside it does too.
 * No arrow keys between rows: that would be new keyboard work.
 */
export function AddToDashboard({
  dashboards,
  busy,
  onPick,
}: {
  readonly dashboards: readonly DashboardChoice[];
  /** While an add is on its way: no second one. */
  readonly busy: boolean;
  readonly onPick: (dashboardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const heading = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    setFind('');
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      setFind('');
      button.current?.focus();
    };
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) === true || button.current?.contains(target) === true)
        return;
      setOpen(false);
      setFind('');
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open]);

  const wanted = find.trim().toLocaleLowerCase();
  const found =
    wanted === ''
      ? dashboards
      : dashboards.filter((dashboard) => dashboard.title.toLocaleLowerCase().includes(wanted));

  return (
    <div
      className="chart-page__add"
      // Focus gone from the button and the picker puts it away, as the
      // shell's popover goes (T686's review).
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next !== null && event.currentTarget.contains(next)) return;
        if (open) {
          setOpen(false);
          setFind('');
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="btn-sm chart-page__add-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        // Busy, not disabled: focus stays on it while the add runs (T686's review).
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          if (open) close(false);
          else setOpen(true);
        }}
      >
        ＋ Add to a dashboard…
      </button>
      {open ? (
        <div
          ref={box}
          role="dialog"
          aria-labelledby={heading}
          className="chart-page__picker"
          data-testid="add-to-dashboard-picker"
        >
          <span id={heading} className="visually-hidden">
            Add to a dashboard
          </span>
          <div className="chart-page__pick-find">
            <input
              ref={field}
              type="search"
              aria-label="Find a dashboard"
              placeholder="Find a dashboard"
              value={find}
              onChange={(event) => {
                setFind(event.target.value);
              }}
            />
          </div>
          {found.length === 0 ? (
            <p className="chart-page__pick-none">
              {dashboards.length === 0
                ? 'No dashboard in My workspace to add it to.'
                : 'No dashboard by that name.'}
            </p>
          ) : (
            <ul className="chart-page__pick-list">
              {found.map((dashboard) => (
                <li key={dashboard.id}>
                  <button
                    type="button"
                    className="chart-page__pick"
                    onClick={() => {
                      onPick(dashboard.id);
                      close(true);
                    }}
                  >
                    <span className="itemicon ic-dash" aria-hidden="true" />
                    <span className="chart-page__pick-title">{dashboard.title}</span>
                    <span className="chart-page__pick-folder">{dashboard.folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
