import { useId, useState } from 'react';

import type { ButtonAction } from '@wechart/core';

import { Menu, type MenuEntry } from '../../shell/Menu';

/** The four kinds a button may run (rule 136; AC-530), in the order + action offers them. */
const KINDS: readonly { readonly kind: ButtonAction['kind']; readonly name: string }[] = [
  { kind: 'page', name: 'Go to page tab' },
  { kind: 'bookmark', name: 'Apply bookmark' },
  { kind: 'resetFilters', name: 'Reset filters' },
  { kind: 'export', name: 'Export' },
];

const nameOf = (kind: ButtonAction['kind']) =>
  KINDS.find((each) => each.kind === kind)?.name ?? kind;

/** The Link/button tile's styles (direction.md §2; rule 136). */
const STYLES = [
  ['button', 'Button'],
  ['primary', 'Primary'],
  ['text', 'Text link'],
] as const;

export interface ActionListProps {
  readonly attrs: Readonly<Record<string, unknown>>;
  /** The dashboard's page tabs, a Go to page tab's choices. */
  readonly pages: readonly { readonly id: string; readonly title: string }[];
  /** The bookmarks this reader can see on the dashboard, an Apply bookmark's choices. */
  readonly bookmarks: readonly { readonly id: string; readonly name: string }[];
  /** The tiles whose data can be exported, by name. */
  readonly tiles: readonly { readonly id: string; readonly name: string }[];
  readonly onChange: (settings: Record<string, unknown>) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored actions of the four kinds, in order; anything else is not listed. */
function storedActions(raw: unknown): ButtonAction[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (action): action is ButtonAction =>
      isRecord(action) && KINDS.some((each) => each.kind === action['kind']),
  );
}

/**
 * An Action button's settings in Properties (T894, AC-530; design 21 state
 * E): its label, its style, and "When pressed · in this order", the ordered
 * list of its actions, each a row with what it needs — a page tab, a
 * bookmark, the tiles to export — and a ⋮⋮ menu of Move up, Move down and
 * Remove. + action offers the four declared kinds and nothing else.
 */
export function ActionList({ attrs, pages, bookmarks, tiles, onChange }: ActionListProps) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);
  const actions = storedActions(attrs['actions']);
  const label = typeof attrs['label'] === 'string' ? attrs['label'] : '';
  const style = typeof attrs['style'] === 'string' ? attrs['style'] : 'button';
  const set = (next: readonly ButtonAction[]) => {
    onChange({ actions: next });
  };
  const replace = (at: number, action: ButtonAction) => {
    set(actions.map((each, index) => (index === at ? action : each)));
  };
  const swap = (at: number, by: number) => {
    const next = [...actions];
    const [moved] = next.splice(at, 1);
    if (moved === undefined) return;
    next.splice(at + by, 0, moved);
    set(next);
  };
  const fresh = (kind: ButtonAction['kind']): ButtonAction => {
    switch (kind) {
      case 'page':
        return { kind, page: pages[0]?.id ?? '' };
      case 'bookmark':
        return { kind, bookmark: bookmarks[0]?.id ?? '' };
      case 'resetFilters':
        return { kind };
      case 'export':
        return { kind, tiles: [] };
    }
  };
  const addEntries: MenuEntry[] = KINDS.map(({ kind, name }) => ({
    kind: 'item',
    key: kind,
    label: name,
    onSelect: () => {
      set([...actions, fresh(kind)]);
    },
  }));
  const moveEntries = (at: number): MenuEntry[] => [
    {
      kind: 'item',
      key: 'up',
      label: 'Move up',
      disabled: at === 0 ? 'It is first.' : undefined,
      onSelect: () => {
        swap(at, -1);
      },
    },
    {
      kind: 'item',
      key: 'down',
      label: 'Move down',
      disabled: at === actions.length - 1 ? 'It is last.' : undefined,
      onSelect: () => {
        swap(at, 1);
      },
    },
    {
      kind: 'item',
      key: 'remove',
      label: 'Remove',
      onSelect: () => {
        set(actions.filter((_, index) => index !== at));
      },
    },
  ];

  return (
    <div className="text-actions">
      <label className="text-actions__label">
        <span>Label</span>
        <input
          type="text"
          value={label}
          onChange={(event) => {
            onChange({ label: event.target.value });
          }}
        />
      </label>
      <fieldset className="text-element-settings__choices">
        <legend>Style</legend>
        {STYLES.map(([value, words]) => (
          <label key={value}>
            <input
              type="radio"
              name={`${id}-style`}
              value={value}
              checked={style === value}
              onChange={() => {
                onChange({ style: value });
              }}
            />
            {words}
          </label>
        ))}
      </fieldset>
      <p id={`${id}-order`} className="text-actions__head">
        When pressed · in this order
      </p>
      <ol aria-label="When pressed, in this order" className="text-actions__list">
        {actions.map((action, at) => {
          const named = `${String(at + 1)} · ${nameOf(action.kind)}`;
          return (
            // Keyed by place: two actions may be the same.
            <li key={at} data-action={action.kind} className="text-actions__row">
              <span className="text-actions__grip">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${named}`}
                  aria-expanded={moving === at}
                  onClick={() => {
                    setMoving(moving === at ? null : at);
                  }}
                >
                  ⋮⋮
                </button>
                {moving === at ? (
                  <Menu
                    label={`Move ${named}`}
                    entries={moveEntries(at)}
                    onClose={() => {
                      setMoving(null);
                    }}
                  />
                ) : null}
              </span>
              {action.kind === 'page' ? (
                <label>
                  <span>{named}</span>
                  <select
                    aria-label={named}
                    value={action.page}
                    onChange={(event) => {
                      replace(at, { kind: 'page', page: event.target.value });
                    }}
                  >
                    {pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : action.kind === 'bookmark' ? (
                <label>
                  <span>{named}</span>
                  <select
                    aria-label={named}
                    value={action.bookmark}
                    onChange={(event) => {
                      replace(at, { kind: 'bookmark', bookmark: event.target.value });
                    }}
                  >
                    {bookmarks.length === 0 ? <option value="">No bookmarks yet</option> : null}
                    {bookmarks.map((bookmark) => (
                      <option key={bookmark.id} value={bookmark.id}>
                        {bookmark.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : action.kind === 'export' ? (
                <fieldset>
                  <legend>{`${named} · data of tiles as CSV`}</legend>
                  {tiles.map((tile) => (
                    <label key={tile.id}>
                      <input
                        type="checkbox"
                        checked={action.tiles.includes(tile.id)}
                        onChange={(event) => {
                          // Kept in the dashboard's tile order, whatever order they're ticked in.
                          const chosen = new Set(action.tiles);
                          if (event.target.checked) chosen.add(tile.id);
                          else chosen.delete(tile.id);
                          replace(at, {
                            kind: 'export',
                            tiles: tiles.map((each) => each.id).filter((each) => chosen.has(each)),
                          });
                        }}
                      />
                      {tile.name}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <span>{`${named} · to the dashboard's saved values`}</span>
              )}
            </li>
          );
        })}
      </ol>
      <span className="text-actions__add">
        <button
          type="button"
          className="btn"
          aria-expanded={adding}
          onClick={() => {
            setAdding(!adding);
          }}
        >
          + action
        </button>
        {adding ? (
          <Menu
            label="Add an action"
            entries={addEntries}
            onClose={() => {
              setAdding(false);
            }}
          />
        ) : null}
      </span>
    </div>
  );
}
