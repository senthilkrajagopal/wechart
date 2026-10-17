import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { NotFound } from '../../shell/NotFound';
import { ME_QUERY } from '../../shell/me';
import { hiddenWorkspacesFor } from '../../shell/WorkspaceSwitcher';
import {
  editorShare,
  LEFT_PANE,
  LEFT_RAIL_QUERY,
  paneWidth,
  RIGHT_PANE,
  RIGHT_RAIL_QUERY,
  roomFor,
  SPLIT,
  useWindowMatches,
} from './panes';

/**
 * The SQL runner workspace at `/sql` (F42; R78; design 17, direction §7f).
 *
 * Super-Admins' and read-write members' alone, as Jobs and Schedules are
 * (AC-001, AC-446; T796). Anyone else gets the page an address that matches
 * nothing gets, so the two can't be told apart (rule 67); and until who is
 * signed in is known, nothing of it, never a moment of content they may not
 * see (T500's review: fail closed).
 */
export function SqlWorkspace() {
  const me = useQuery({ ...ME_QUERY, retry: false });
  if (me.data === undefined) return me.isError ? <NotFound /> : null;
  if (hiddenWorkspacesFor(me.data).includes('sql')) return <NotFound />;
  return <Workbench />;
}

type Side = 'left' | 'right';

/**
 * Direction §2's three-pane workbench (T797; rule 91; design 17, screen 1
 * and state O): the picker and schema browser on the left, the tabs over the
 * editor over the results in the centre, Saved and History on the right.
 * Each side pane is dragged by its edge within its range; below 1,280 px the
 * right one, and below 1,024 the left one too, is a 40 px rail that opens
 * over the centre (design 17's Q1, (a)), one at a time.
 */
function Workbench() {
  const [left, setLeft] = useState<number>(LEFT_PANE.start);
  const [right, setRight] = useState<number>(RIGHT_PANE.start);
  const [share, setShare] = useState<number>(SPLIT.editor);
  const [open, setOpen] = useState<Side | null>(null);
  const leftFolded = useWindowMatches(LEFT_RAIL_QUERY);
  const rightFolded = useWindowMatches(RIGHT_RAIL_QUERY);
  const workspace = useRef<HTMLElement>(null);
  const below = useRef<HTMLDivElement>(null);
  const split = useRef<{ readonly y: number; readonly from: number } | null>(null);
  const leftShown = leftFolded ? LEFT_PANE.rail : left;
  const rightShown = rightFolded ? RIGHT_PANE.rail : right;

  // A pane opened over the centre, then unfolded by a wider window: closed,
  // so it doesn't come back open, and take focus, when the window narrows
  // again (T797's review). Set as it renders, as React's "adjusting state
  // when a prop changes" does.
  if ((open === 'left' && !leftFolded) || (open === 'right' && !rightFolded)) setOpen(null);

  /** The room a pane has beside the other and the editor's 560 px; any, until measured. */
  const roomBeside = (other: number) => {
    const width = workspace.current?.getBoundingClientRect().width ?? 0;
    return width > 0 ? roomFor(width, other) : Infinity;
  };
  /** The editor and results' height, below the tabs. */
  const splitHeight = () => below.current?.getBoundingClientRect().height ?? 0;
  const endSplit = () => {
    split.current = null;
  };

  const style = {
    '--sql-left': `${String(leftShown)}px`,
    '--sql-right': `${String(rightShown)}px`,
  } as CSSProperties;
  return (
    <section
      ref={workspace}
      className="sql-workspace"
      aria-labelledby="sql-workspace-title"
      style={style}
    >
      {/* Design 17 draws no title over the panes; the page still has its heading. */}
      <h1 id="sql-workspace-title" className="visually-hidden">
        SQL runner
      </h1>
      <SidePane
        side="left"
        label="Data source and schema"
        folded={leftFolded}
        open={leftFolded && open === 'left'}
        width={left}
        onResize={(width) => {
          setLeft(paneWidth(LEFT_PANE, width, roomBeside(rightShown)));
        }}
        onOpen={(opened) => {
          setOpen(opened ? 'left' : null);
        }}
      >
        <h2 className="sql-pane__head">Data source</h2>
        <h2 className="sql-pane__head">Schema</h2>
      </SidePane>
      <div
        className="sql-centre"
        data-testid="sql-centre"
        style={{ '--sql-editor': `${String(Math.round(share * 1000) / 10)}%` } as CSSProperties}
      >
        <div className="sql-centre__tabs" data-testid="sql-tabs-area" />
        {/* The split is of what lies below the tabs (T797's review). */}
        <div ref={below} className="sql-centre__split">
          <div className="sql-centre__editor" data-testid="sql-editor-area" />
          <span
            className="sql-centre__grip"
            title="Drag to resize · double-click to reset"
            aria-hidden="true"
            onPointerDown={(event) => {
              split.current = { y: event.clientY, from: share * splitHeight() };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const from = split.current;
              if (from === null) return;
              setShare(editorShare(from.from + (event.clientY - from.y), splitHeight()));
            }}
            onPointerUp={endSplit}
            onPointerCancel={endSplit}
            onLostPointerCapture={endSplit}
            onDoubleClick={() => {
              setShare(SPLIT.editor);
            }}
          />
          <div className="sql-centre__results" data-testid="sql-results-area" />
        </div>
      </div>
      <SidePane
        side="right"
        label="Saved and History"
        folded={rightFolded}
        open={rightFolded && open === 'right'}
        width={right}
        onResize={(width) => {
          setRight(paneWidth(RIGHT_PANE, width, roomBeside(leftShown)));
        }}
        onOpen={(opened) => {
          setOpen(opened ? 'right' : null);
        }}
      >
        <h2 className="sql-pane__head">Saved and History</h2>
      </SidePane>
    </section>
  );
}

/**
 * A side pane: its body, and the edge that resizes it; folded, a rail whose
 * button opens the body over the centre. Opened, focus goes into it, and
 * Esc closes it and hands focus back to the button (rule 85).
 */
function SidePane({
  side,
  label,
  folded,
  open,
  width,
  onResize,
  onOpen,
  children,
}: {
  readonly side: Side;
  readonly label: string;
  readonly folded: boolean;
  readonly open: boolean;
  readonly width: number;
  readonly onResize: (width: number) => void;
  readonly onOpen: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLButtonElement>(null);
  const dragged = useRef<{ readonly x: number; readonly from: number } | null>(null);
  const start = side === 'left' ? LEFT_PANE.start : RIGHT_PANE.start;
  // Opened from its rail: focus into it once it shows, so Tab goes on from there.
  const closing = useRef(onOpen);
  useEffect(() => {
    closing.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (!open) return undefined;
    body.current?.focus();
    // Its own Escape only, from within it: another popover's is that one's.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !body.current?.contains(event.target as Node)) return;
      closing.current(false);
      rail.current?.focus();
    };
    // A press outside it and its rail, in the editor say: closed, never left
    // over the centre (T797's review), as the narrow menu does.
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (body.current?.contains(target) || rail.current?.contains(target)) return;
      closing.current(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open]);
  const endDrag = () => {
    dragged.current = null;
  };
  return (
    <aside
      className={`sql-pane sql-pane--${side}`}
      aria-label={label}
      data-folded={String(folded)}
      data-open={String(open)}
    >
      <div className="sql-pane__rail">
        <button
          ref={rail}
          type="button"
          aria-label={label}
          title={label}
          aria-expanded={open}
          onClick={() => {
            onOpen(!open);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            {side === 'left' ? (
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            ) : (
              <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
        </button>
      </div>
      <div
        ref={body}
        className="sql-pane__body"
        tabIndex={-1}
      >
        {children}
      </div>
      <span
        className="sql-pane__grip"
        title="Drag to resize · double-click to reset"
        aria-hidden="true"
        onPointerDown={(event) => {
          dragged.current = { x: event.clientX, from: width };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = dragged.current;
          if (from === null) return;
          const dx = event.clientX - from.x;
          onResize(side === 'left' ? from.from + dx : from.from - dx);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => {
          onResize(start);
        }}
      />
    </aside>
  );
}
