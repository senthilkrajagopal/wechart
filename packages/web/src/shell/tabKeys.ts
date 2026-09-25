import type { KeyboardEvent } from 'react';

/**
 * The WAI-ARIA tabs pattern's keys on a tab (T182, AC-176): ← and → move to
 * the tab before or after, wrapping; Home and End to the first and last. The
 * tab moved to is chosen and takes focus — automatic activation, as clicking
 * it would. Its tablist is one Tab stop, the chosen tab (`tabIndex` 0, the
 * others −1), so the arrows are the way along it.
 *
 * Only the tablist's own tabs count: a tab group's strip also holds its
 * Delete buttons, which are not tabs.
 */
export function onTabKey(event: KeyboardEvent<HTMLElement>, choose: (index: number) => void): void {
  const list = event.currentTarget.closest('[role="tablist"]');
  if (list === null) return;
  const tabs = [...list.querySelectorAll<HTMLElement>(':scope > [role="tab"]')];
  const at = tabs.indexOf(event.currentTarget);
  if (at < 0) return;
  const last = tabs.length - 1;
  const next =
    event.key === 'ArrowRight'
      ? at === last
        ? 0
        : at + 1
      : event.key === 'ArrowLeft'
        ? at === 0
          ? last
          : at - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : -1;
  if (next < 0) return;
  event.preventDefault();
  choose(next);
  tabs[next]?.focus();
}
