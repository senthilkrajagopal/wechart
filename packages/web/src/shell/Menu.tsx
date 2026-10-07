import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

/**
 * A menu in the WAI-ARIA APG Menu pattern (T266; AC-199, AC-246, AC-176;
 * research/context-menu-and-submenus.md): the tile menu's core, with the
 * pattern's keys, submenus, checkbox items, named groups and separators —
 * one implementation, so every opener of it answers the same keys.
 *
 * Keys, from the research's key map:
 * - ↓ ↑ move between the menu's items, wrapping; Home and End go to the ends.
 * - Enter runs an item and closes; Space too, except on a checkbox item,
 *   which it toggles while the menu stays open.
 * - → Enter or Space on an item with a submenu opens it on its first item;
 *   ← or Escape inside a submenu closes only that submenu, focus back on its
 *   item.
 * - Escape at the top closes the menu; Tab from anywhere closes all of it.
 *
 * Items are elements with roles, not buttons (the research's gotcha 10): a
 * checkbox item needs Space and Enter to differ, which a native button's
 * activation does not allow. A disabled item stays focusable and says why.
 */
export type MenuEntry =
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly label: string;
      readonly onSelect: () => void;
      /**
       * Run in its place by Ctrl+Enter or ⌘+Enter, or a Ctrl- or ⌘-click: a
       * series or panel added to the marking, as a Ctrl-click on its legend
       * entry adds it (T634; R64, the user: "Ctrl+Enter adds").
       */
      readonly onAdd?: (() => void) | undefined;
      /** The words saying so, as the item's description. */
      readonly addHint?: string | undefined;
      /**
       * Why it cannot run; absent, it can. Given as the item's description
       * (`aria-describedby`), which a keyboard reaches, where a tooltip would
       * not (T182).
       */
      readonly disabled?: string | undefined;
      /** An element already saying why, to describe it by instead. */
      readonly describedBy?: string | undefined;
    }
  | {
      readonly kind: 'checkbox';
      readonly key: string;
      readonly label: string;
      readonly checked: boolean;
      readonly onToggle: () => void;
      readonly disabled?: string | undefined;
    }
  | {
      readonly kind: 'submenu';
      readonly key: string;
      readonly label: string;
      readonly entries: readonly MenuEntry[];
      readonly disabled?: string | undefined;
    }
  | {
      readonly kind: 'group';
      readonly key: string;
      /** Named by words of its own, or by an element outside the menu. */
      readonly label?: string | undefined;
      readonly labelledBy?: string | undefined;
      readonly entries: readonly MenuEntry[];
    }
  | { readonly kind: 'separator'; readonly key: string }
  /**
   * A line of information in a menu that runs nothing — what Data as of
   * says of an answer (T273). An item that is off, so the arrows reach it and
   * a screen reader reads it in turn, with no reason to give.
   */
  | { readonly kind: 'text'; readonly key: string; readonly text: string };

/** Why the menu is closing: Escape at its top, Tab, or an item that ran. */
export type MenuClose = 'escape' | 'tab' | 'selected';

/**
 * This menu's own items, groups' included and submenus' not: a submenu's
 * item sits in a `role="none"` wrapper, in the menu or in a group (T266's
 * review: one in a group was skipped).
 */
const OWN_ITEMS = [
  ':scope > [role^="menuitem"]',
  ':scope > [role="group"] > [role^="menuitem"]',
  ':scope > [role="none"] > [role^="menuitem"]',
  ':scope > [role="group"] > [role="none"] > [role^="menuitem"]',
].join(', ');

export function Menu({
  entries,
  label,
  labelledBy,
  onClose,
  nested = false,
  className,
}: {
  entries: readonly MenuEntry[];
  label?: string | undefined;
  labelledBy?: string | undefined;
  onClose: (how: MenuClose) => void;
  /** A submenu: ← closes it, as Escape does. */
  nested?: boolean;
  className?: string | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [openKey, setOpenKey] = useState<string | undefined>(undefined);
  const ids = useId();

  const items = () => [...(box.current?.querySelectorAll<HTMLElement>(OWN_ITEMS) ?? [])];
  const focusAt = (index: number) => {
    const all = items();
    if (all.length === 0) return;
    all[((index % all.length) + all.length) % all.length]?.focus();
  };

  // Opening focuses its first item.
  useEffect(() => {
    box.current?.querySelector<HTMLElement>(OWN_ITEMS)?.focus();
  }, []);

  /**
   * A submenu opens beside its item and, where that would leave the window,
   * on the other side of it: measured once it has laid out.
   *
   * Placed `fixed`, by its item's box (research §6; T266's review): placed
   * inside its menu, a menu that scrolls — the tile menu does, at its height
   * cap — clipped it at its own edge.
   */
  useLayoutEffect(() => {
    if (!nested) return;
    const own = box.current;
    const item = labelledBy === undefined ? null : window.document.getElementById(labelledBy);
    if (own === null || item === null) return;
    const from = item.getBoundingClientRect();
    const size = own.getBoundingClientRect();
    const gap = 4;
    const right = from.right + gap;
    const left =
      right + size.width > window.innerWidth ? Math.max(0, from.left - gap - size.width) : right;
    const top = Math.max(0, Math.min(from.top, window.innerHeight - size.height - 8));
    own.style.position = 'fixed';
    own.style.left = `${String(left)}px`;
    own.style.top = `${String(top)}px`;
  }, [nested, labelledBy]);

  const entryOf = (key: string): MenuEntry | undefined => {
    const find = (list: readonly MenuEntry[]): MenuEntry | undefined => {
      for (const entry of list) {
        if (entry.key === key) return entry;
        if (entry.kind === 'group') {
          const inner = find(entry.entries);
          if (inner !== undefined) return inner;
        }
      }
      return undefined;
    };
    return find(entries);
  };

  const run = (entry: MenuEntry, how: 'enter' | 'space' | 'click', add = false) => {
    if (entry.kind === 'group' || entry.kind === 'separator' || entry.kind === 'text') return;
    if (entry.disabled !== undefined) return;
    if (entry.kind === 'submenu') {
      setOpenKey(entry.key);
      return;
    }
    if (entry.kind === 'checkbox') {
      entry.onToggle();
      if (how !== 'space') onClose('selected');
      return;
    }
    // With Ctrl or ⌘, its add where it has one (T634).
    if (add && entry.onAdd !== undefined) entry.onAdd();
    else entry.onSelect();
    onClose('selected');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const all = items();
    const at = all.indexOf(target);
    // A key from a submenu below: it answered it, or passed it up as a close.
    if (at === -1) return;
    const entry = entryOf(target.dataset['key'] ?? '');
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case 'ArrowDown':
        handled();
        focusAt(at + 1);
        return;
      case 'ArrowUp':
        handled();
        focusAt(at - 1);
        return;
      case 'Home':
        handled();
        focusAt(0);
        return;
      case 'End':
        handled();
        focusAt(all.length - 1);
        return;
      case 'Enter':
        handled();
        if (entry !== undefined) run(entry, 'enter', event.ctrlKey || event.metaKey);
        return;
      case ' ':
        handled();
        if (entry !== undefined) run(entry, 'space');
        return;
      case 'ArrowRight':
        if (entry?.kind === 'submenu') {
          handled();
          run(entry, 'enter');
        }
        return;
      case 'ArrowLeft':
        if (nested) {
          handled();
          onClose('escape');
        }
        return;
      case 'Escape':
        handled();
        onClose('escape');
        return;
      case 'Tab':
        // Focus moves on with the Tab; the menu goes (APG).
        event.stopPropagation();
        onClose('tab');
        return;
      default:
        return;
    }
  };

  const itemId = (key: string) => `${ids}-${key}`;
  /**
   * The id of an item's add hint, with no whitespace in it: an item's key
   * may be a value ("series-United States"), and `aria-describedby` is a list
   * split at whitespace (T634's review).
   */
  const addsId = (key: string) => `${ids}-adds-${encodeURIComponent(key)}`;
  /**
   * A disabled entry's reason as its description, and the words that give
   * it: kept beside the item, hidden, and outside it, so they describe it
   * without becoming part of its name.
   */
  const why = (entry: {
    key: string;
    disabled?: string | undefined;
    describedBy?: string | undefined;
  }) =>
    entry.disabled === undefined
      ? { attributes: {}, words: null }
      : entry.describedBy !== undefined
        ? {
            attributes: { 'aria-disabled': true, 'aria-describedby': entry.describedBy },
            words: null,
          }
        : {
            attributes: { 'aria-disabled': true, 'aria-describedby': `${itemId(entry.key)}-why` },
            words: (
              <span id={`${itemId(entry.key)}-why`} hidden>
                {entry.disabled}
              </span>
            ),
          };
  const render = (entry: MenuEntry) => {
    switch (entry.kind) {
      case 'separator':
        return (
          <div
            key={entry.key}
            role="separator"
            aria-orientation="horizontal"
            className="menu__separator"
          />
        );
      case 'text':
        return (
          <div
            key={entry.key}
            role="menuitem"
            tabIndex={-1}
            data-key={entry.key}
            aria-disabled
            className="menu__item menu__text"
          >
            {entry.text}
          </div>
        );
      case 'group':
        return (
          <div
            key={entry.key}
            role="group"
            className="menu__group"
            {...(entry.labelledBy === undefined ? {} : { 'aria-labelledby': entry.labelledBy })}
            {...(entry.label === undefined ? {} : { 'aria-label': entry.label })}
          >
            {entry.entries.map(render)}
          </div>
        );
      case 'submenu': {
        const open = openKey === entry.key;
        return (
          <div key={entry.key} role="none" className="menu__sub">
            {/* Its keys are the menu's, taken on the container (APG menu). */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <div
              id={itemId(entry.key)}
              role="menuitem"
              tabIndex={-1}
              data-key={entry.key}
              className="menu__item"
              aria-haspopup="menu"
              aria-expanded={open}
              {...why(entry).attributes}
              onClick={() => {
                if (entry.disabled !== undefined) return;
                setOpenKey(open ? undefined : entry.key);
              }}
            >
              {entry.label}
              <span aria-hidden="true" className="menu__chevron">
                {' ›'}
              </span>
            </div>
            {why(entry).words}
            {open ? (
              <Menu
                nested
                entries={entry.entries}
                labelledBy={itemId(entry.key)}
                className="menu--sub"
                onClose={(how) => {
                  setOpenKey(undefined);
                  if (how === 'escape') {
                    box.current
                      ?.querySelector<HTMLElement>(`#${CSS.escape(itemId(entry.key))}`)
                      ?.focus();
                    return;
                  }
                  onClose(how);
                }}
              />
            ) : null}
          </div>
        );
      }
      case 'checkbox':
        return (
          <Fragment key={entry.key}>
            {/* Its keys are the menu's, taken on the container (APG menu). */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <div
              role="menuitemcheckbox"
              tabIndex={-1}
              data-key={entry.key}
              className="menu__item"
              aria-checked={entry.checked}
              {...why(entry).attributes}
              onClick={() => {
                run(entry, 'click');
              }}
            >
              <span aria-hidden="true" className="menu__check">
                {entry.checked ? '✓' : ''}
              </span>
              {entry.label}
            </div>
            {why(entry).words}
          </Fragment>
        );
      case 'item':
        return (
          <Fragment key={entry.key}>
            {/* Its keys are the menu's, taken on the container (APG menu). */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <div
              role="menuitem"
              tabIndex={-1}
              data-key={entry.key}
              className="menu__item"
              {...(entry.addHint === undefined || entry.disabled !== undefined
                ? {}
                : { 'aria-describedby': addsId(entry.key) })}
              {...why(entry).attributes}
              onClick={(event) => {
                run(entry, 'click', event.ctrlKey || event.metaKey);
              }}
            >
              {entry.label}
            </div>
            {why(entry).words}
            {entry.addHint === undefined || entry.disabled !== undefined ? null : (
              <span id={addsId(entry.key)} hidden>
                {entry.addHint}
              </span>
            )}
          </Fragment>
        );
    }
  };

  return (
    // The menu takes its keys itself: the APG menu pattern, not a widget of
    // native controls, so the handler belongs on the container.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      ref={box}
      role="menu"
      aria-orientation="vertical"
      className={className === undefined ? 'menu' : `menu ${className}`}
      {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}
      {...(label === undefined ? {} : { 'aria-label': label })}
      onKeyDown={onKeyDown}
    >
      {entries.map(render)}
    </div>
  );
}
