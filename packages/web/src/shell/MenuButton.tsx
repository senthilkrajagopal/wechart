import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A button that opens a menu of actions — the prototype's "＋ New ▾", a row's
 * ⋯ and a tile's ⋯ — in the WAI-ARIA menu button pattern, so each of them is
 * reachable and operable from the keyboard the same way (AC-176).
 *
 * - The button says it opens a menu (`aria-haspopup`) and whether it is open.
 * - Opening focuses the first item; the arrow keys, Home and End move between
 *   items and wrap at the ends; Enter or a click runs one and closes.
 * - Escape closes and gives focus back to the button, so the user is where
 *   they were. A pointer going down anywhere else, or Tab, closes it too.
 *
 * Items that are disabled stay in the menu and say why in their title — a
 * missing item reads as a missing feature, a disabled one as a state.
 */
export interface MenuItem {
  readonly key: string;
  readonly label: ReactNode;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Shown as the item's tooltip; the reason, for a disabled item. */
  readonly title?: string;
  /** A destructive action, drawn as the prototype draws Delete. */
  readonly danger?: boolean;
  /** For a test to find the item by what it stands for, not its words. */
  readonly testId?: string;
  /** Set apart from the items before it by a rule (design 12 state A: Generate). */
  readonly separatorBefore?: boolean;
}

export interface MenuButtonProps {
  /** The accessible name of the button and of its menu. */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** What the button shows; its accessible name is `label`. */
  readonly children: ReactNode;
  readonly className?: string;
  /** Which edge of the button the menu lines up with. */
  readonly align?: 'start' | 'end';
  /** For a test to find the button. */
  readonly testId?: string;
  /** Nothing to offer yet: the button can't be pressed (T467, UX-063). */
  readonly disabled?: boolean;
  /** The id of what says why, for a disabled button. */
  readonly describedBy?: string;
  /**
   * A head drawn over the items: "New in My workspace" (design 13, state G;
   * T692). The menu keeps `label` as its name, which its button has too.
   */
  readonly heading?: string;
}

export function MenuButton({
  label,
  items,
  children,
  className = 'btn-primary',
  align = 'end',
  testId,
  disabled = false,
  describedBy,
  heading,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusItem = (index: number) => {
    const count = items.length;
    if (count === 0) return;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  // Opening moves focus into the menu, which is an effect of the user's own
  // action — not `autoFocus` on load.
  useEffect(() => {
    if (open) focusItem(0);
    // `focusItem` reads the refs, which are current once the menu renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A pointer going down anywhere outside closes it, as a menu does.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent | MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    const at = itemRefs.current.findIndex((item) => item === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(at + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(at - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        // Kept from reaching anything listening further up — a dialog or an
        // edit session would take the same Escape as "leave".
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <span className="menu-button" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={className}
        data-testid={testId}
        aria-label={label}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((now) => !now)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          // Focusable by script, never by Tab: focus lives on its items.
          tabIndex={-1}
          className={`menu-button__menu menu-button__menu--${align}`}
          onKeyDown={onMenuKey}
        >
          {heading === undefined ? null : (
            // Drawn for the eye; the menu's name and its items say the same.
            <div className="menu-button__head" aria-hidden="true">
              {heading}
            </div>
          )}
          {items.map((item, index) => [
            item.separatorBefore === true ? (
              <div key={`${item.key} rule`} role="separator" className="menu-button__sep" />
            ) : null,
            <button
              key={item.key}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              // The menu owns focus; Tab leaves it rather than walking items.
              tabIndex={-1}
              className={item.danger === true ? 'menu-button__item is-danger' : 'menu-button__item'}
              data-testid={item.testId}
              /**
               * `aria-disabled`, not `disabled`: a natively disabled button
               * cannot take focus, so a menu whose first item is disabled
               * opened with focus nowhere — and with every item disabled the
               * arrows, Escape and Tab stopped working at all.
               */
              aria-disabled={item.disabled === true ? 'true' : undefined}
              title={item.title}
              onClick={() => {
                if (item.disabled === true) return;
                // Back to the button first; an item that moves focus itself
                // (opening a field to type in) does so after this.
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>,
          ])}
        </div>
      ) : null}
    </span>
  );
}
