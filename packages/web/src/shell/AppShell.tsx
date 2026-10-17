import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { useNarrowWindow } from '../dashboard/useNarrowWindow';
import { ReviewsControl } from '../workspaces/reviews/ReviewsControl';
import { AccountMenu } from './AccountMenu';
import { ME_QUERY } from './me';
import { openSearch, SearchPalette } from './SearchPalette';
import { ThemeToggle } from './ThemeToggle';
import { hiddenWorkspacesFor, WorkspaceSwitcher, type WorkspaceId } from './WorkspaceSwitcher';

/**
 * The top bar and the surface beneath it (AC-001, direction.md §2).
 *
 * The bar is a banner landmark and the workspace content a main landmark, so
 * the keyboard and screen-reader paths through the app are structural rather
 * than added later (AC-176).
 */
export interface AppShellProps {
  /** The workspace the page belongs to; none for a page that is in none. */
  readonly workspace?: WorkspaceId;
  /** The Reviews page, whose control the bar marks current (T355). */
  readonly reviews?: boolean;
  readonly children?: React.ReactNode;
}

/**
 * The workspaces the user may not open (AC-001; T500, T331; designs 08 and
 * 09): by role, from who `/api/me` says is signed in, which the sign-in gate
 * has asked before the bar renders.
 */
function useHiddenWorkspaces(): readonly WorkspaceId[] {
  const me = useQuery({ ...ME_QUERY, retry: false });
  return hiddenWorkspacesFor(me.data);
}

/** The shortcut as this platform writes it. */
const shortcut = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

/**
 * The top bar's search field (AC-190), the prototype's `.search`: it looks
 * like a field and names the shortcut, so search is visible to someone who
 * does not know ⌘K — and it is a button, because what it does is open the
 * palette, where the typing happens.
 */
function SearchTrigger({ returnTo }: { readonly returnTo?: () => Element | null }) {
  return (
    <button
      type="button"
      className="app-search"
      onClick={(event) => {
        openSearch(returnTo?.() ?? event.currentTarget);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {/* Words that fit the prototype's 260 px (N6): its "Search fields,
          charts, models" leaves out dashboards, and naming all four does not
          fit. The palette's own field names them once it is open. A small
          choice made in T245 and put to the user; theirs to change. */}
      <span>Search wechart</span>
      <kbd>{shortcut()}</kbd>
    </button>
  );
}

/**
 * Below 1,024 px, the bar's navigation and search folded into a menu (T396,
 * AC-304), so the bar fits a phone's width rather than the page scrolling
 * sideways. The stylesheet shows this button, and hides the bar's own
 * switcher and search field, only there. A disclosure: the button says
 * whether it is open, and the panel, always in the page and hidden while
 * closed, follows it, so Tab goes on into it. A choice, Escape from within
 * it, focus or a press leaving it, or the window widening past 1,024 px
 * closes it; Escape hands focus back to the button.
 */
function NarrowMenu({
  workspace,
  hidden,
}: {
  readonly workspace: WorkspaceId | undefined;
  readonly hidden: readonly WorkspaceId[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const narrow = useNarrowWindow();

  // Widened past 1,024 px, where the stylesheet hides it: closed, not left
  // to come back open when the window narrows again (T396's review). Set as
  // it renders, as React's "adjusting state when a prop changes" does.
  const [wasNarrow, setWasNarrow] = useState(narrow);
  if (narrow !== wasNarrow) {
    setWasNarrow(narrow);
    if (!narrow) setOpen(false);
  }

  useEffect(() => {
    if (!open) return undefined;
    // Its own Escape only: another menu's, opened while this one is, is that
    // menu's to handle (T396's review).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !box.current?.contains(event.target as Node)) return;
      setOpen(false);
      button.current?.focus();
    };
    const onPress = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    // Tabbed out of: closed, rather than left over the page below.
    const onLeave = (event: FocusEvent) => {
      if (!box.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
    };
    // A workspace or search chosen, by pointer or keyboard: its work is done.
    // Heard on the document, after React has run the choice's own handler:
    // closed any sooner, the panel is gone before its button's click reaches
    // React, and search never opens.
    const onChoose = (event: MouseEvent) => {
      const target = event.target as Element;
      if (panel.current?.contains(target) && target.closest('a, button')) setOpen(false);
    };
    const within = box.current;
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    document.addEventListener('click', onChoose);
    within?.addEventListener('focusout', onLeave);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
      document.removeEventListener('click', onChoose);
      within?.removeEventListener('focusout', onLeave);
    };
  }, [open]);

  return (
    <div className="app-bar__menu" ref={box}>
      <button
        ref={button}
        type="button"
        className="icon-button app-bar__menu-button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div
        ref={panel}
        id={panelId}
        className="app-bar__menu-panel"
        data-testid="narrow-menu"
        hidden={!open}
      >
        <WorkspaceSwitcher current={workspace} hidden={hidden} />
        {/* The palette hands focus back to the menu's button, which stays. */}
        <SearchTrigger returnTo={() => button.current} />
      </div>
    </div>
  );
}

export function AppShell({ workspace, reviews = false, children }: AppShellProps) {
  const hidden = useHiddenWorkspaces();
  return (
    <div className="app-shell">
      <header className="app-bar">
        {/* The prototype's brand: the "we" mark, then the name (AC-187). */}
        <span className="app-bar__product">
          <span className="app-bar__mark" data-testid="brand-mark" aria-hidden="true">
            we
          </span>
          wechart
        </span>
        <WorkspaceSwitcher current={workspace} hidden={hidden} />
        {/* Below 1,024 px, in the switcher's place, after the brand: design 09
            state H's order, brand, menu, spacer, Reviews, theme, avatar (T696,
            CMP-07). Hidden wider. */}
        <NarrowMenu workspace={workspace} hidden={hidden} />
        <span className="app-bar__spacer" />
        <SearchTrigger />
        {/* After search, for those who may decide something (T355, rule 76). */}
        <ReviewsControl current={reviews} />
        <ThemeToggle />
        {/* Who is signed in, at the far right (AC-190, AC-252, AC-254). */}
        <AccountMenu />
      </header>
      <main>{children}</main>
      <SearchPalette />
    </div>
  );
}
