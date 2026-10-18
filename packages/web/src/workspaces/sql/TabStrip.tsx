import { useEffect, useId, useRef, useState, type Dispatch } from 'react';

import { MenuButton } from '../../shell/MenuButton';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { onTabKey } from '../../shell/tabKeys';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { CloseTabDialog, useEscape } from './CloseTabDialog';
import { asksBeforeClosing, tabState, type SqlTab, type TabsAction, type TabsState } from './tabs';

/**
 * The editor tabs over the SQL runner's editor (T800, AC-450; design 17,
 * pin 7 and state D): a tablist, as the built ones are (← → Home End), each
 * tab's state an icon on it with its label in its tooltip and accessible
 * name (Q6), its ⋯ and × as buttons after it, and "+" after the list.
 */
export function TabStrip({
  state,
  dispatch,
  sourceName,
  tabId,
  panelId,
  stateOf = (tab) => tabState(tab),
}: {
  readonly state: TabsState;
  readonly dispatch: Dispatch<TabsAction>;
  /** A tab's state, as its result head names it, on the workspace's one clock (T804, AC-452). */
  readonly stateOf?: (tab: SqlTab) => { readonly kind: StateKind; readonly label: string };
  /** A data source's name, by id; none for one not (or no longer) listed. */
  readonly sourceName: (id: string) => string | undefined;
  readonly tabId: (id: string) => string;
  readonly panelId: (id: string) => string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [asking, setAsking] = useState<
    | { readonly kind: 'close'; readonly tab: SqlTab }
    | { readonly kind: 'others'; readonly tab: SqlTab; readonly losing: number }
    | { readonly kind: 'rename'; readonly tab: SqlTab }
    | null
  >(null);
  /** Focus to the open tab once the strip has redrawn, after a tab came or went. */
  const [focusOpen, setFocusOpen] = useState(0);
  useEffect(() => {
    if (focusOpen === 0) return;
    strip.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, [focusOpen]);

  const act = (action: TabsAction) => {
    dispatch(action);
    setFocusOpen((now) => now + 1);
  };
  const ask = (question: NonNullable<typeof asking>) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAsking(question);
  };
  const back = () => {
    setAsking(null);
    opener.current?.focus();
  };
  const close = (tab: SqlTab) => {
    if (asksBeforeClosing(tab)) ask({ kind: 'close', tab });
    else act({ kind: 'close', id: tab.id });
  };
  const closeOthers = (tab: SqlTab) => {
    const losing = state.tabs.filter((other) => other !== tab && asksBeforeClosing(other)).length;
    if (losing > 0) ask({ kind: 'others', tab, losing });
    else act({ kind: 'close-others', id: tab.id });
  };

  const current = state.tabs.find((tab) => tab.id === state.active);
  const currentSource = current === undefined ? undefined : sourceName(current.sourceId);
  return (
    <div className="sql-tabstrip" ref={strip}>
      <div role="tablist" aria-label="SQL tabs" className="sql-tabs">
        {state.tabs.map((tab) => {
          const selected = tab.id === state.active;
          const { kind, label } = stateOf(tab);
          const on = sourceName(tab.sourceId);
          const named = [tab.name, label, ...(on === undefined ? [] : [`on ${on}`])].join(', ');
          return [
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              // Only the open tab's panel is drawn, so only it names one.
              aria-controls={selected ? panelId(tab.id) : undefined}
              aria-label={named}
              title={named}
              tabIndex={selected ? 0 : -1}
              className="sql-tabs__tab"
              onClick={() => {
                dispatch({ kind: 'select', id: tab.id });
              }}
              onKeyDown={(event) => {
                onTabKey(event, (index) => {
                  const chosen = state.tabs[index];
                  if (chosen !== undefined) dispatch({ kind: 'select', id: chosen.id });
                });
              }}
            >
              <StatusIcon kind={kind} />
              {tab.name}
            </button>,
            <MenuButton
              key={`${tab.id} more`}
              label={`Actions for ${tab.name}`}
              className={selected ? 'sql-tabs__icon' : 'sql-tabs__icon sql-tabs__icon--quiet'}
              align="start"
              fixed
              items={[
                {
                  key: 'rename',
                  label: 'Rename…',
                  onSelect: () => {
                    ask({ kind: 'rename', tab });
                  },
                },
                {
                  key: 'duplicate',
                  label: 'Duplicate',
                  onSelect: () => {
                    act({ kind: 'duplicate', id: tab.id });
                  },
                },
                {
                  key: 'close',
                  label: 'Close',
                  onSelect: () => {
                    close(tab);
                  },
                },
                {
                  key: 'others',
                  label: 'Close other tabs',
                  ...(state.tabs.length === 1
                    ? { disabled: true, title: 'No other tab is open.' }
                    : {}),
                  onSelect: () => {
                    closeOthers(tab);
                  },
                },
              ]}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
                <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
              </svg>
            </MenuButton>,
            <button
              key={`${tab.id} close`}
              type="button"
              className="sql-tabs__icon"
              aria-label={`Close ${tab.name}`}
              title={`Close ${tab.name}`}
              onClick={() => {
                close(tab);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>,
          ];
        })}
      </div>
      <button
        type="button"
        className="sql-tabs__icon sql-tabs__add"
        aria-label={currentSource === undefined ? 'New tab' : `New tab on ${currentSource}`}
        title={currentSource === undefined ? 'New tab' : `New tab on ${currentSource}`}
        onClick={() => {
          act({ kind: 'add' });
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {asking?.kind === 'close' ? (
        <CloseTabDialog
          name={asking.tab.name}
          onKeep={back}
          onClose={() => {
            setAsking(null);
            act({ kind: 'close', id: asking.tab.id });
          }}
        />
      ) : null}
      {asking?.kind === 'others' ? (
        <CloseTabDialog
          others={asking.losing}
          onKeep={back}
          onClose={() => {
            setAsking(null);
            act({ kind: 'close-others', id: asking.tab.id });
          }}
        />
      ) : null}
      {asking?.kind === 'rename' ? (
        <RenameTab
          name={asking.tab.name}
          onCancel={back}
          onRename={(name) => {
            dispatch({ kind: 'rename', id: asking.tab.id, name });
            back();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Rename…: the tab's name, focus in it. Esc and Cancel keep the old name;
 * a tab's name lives in this browser only, so nothing more is asked (lane
 * SQL's call).
 */
function RenameTab({
  name,
  onCancel,
  onRename,
}: {
  readonly name: string;
  readonly onCancel: () => void;
  readonly onRename: (name: string) => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState(name);
  useFocusTrap(box);
  useEscape(onCancel);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const blank = typed.trim() === '';
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="dialog"
      >
        <h2 id={`${ids}-title`}>Rename {name}</h2>
        <form
          className="sql-rename"
          onSubmit={(event) => {
            event.preventDefault();
            if (!blank) onRename(typed);
          }}
        >
          <label className="sql-rename__name">
            Name
            <input
              ref={field}
              type="text"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </label>
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={blank}>
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
