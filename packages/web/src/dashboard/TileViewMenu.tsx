import { csvOf, exportNoteOf, rowsText, type DrillOption, type RenderSpec } from '@wechart/core';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { Menu, type MenuEntry } from '../shell/Menu';
import { StateLine, StatusIcon, type StateKind } from '../shell/StatusIcon';
import { chartSvg, drawnChartIn, imageFileName, surfaceOf, svgToPng } from '../tiles/chartImage';

/** Whether this browser shows popovers (every one wechart supports does; jsdom does not). */
const CAN_POP =
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/** A file name from a chart's title: the characters file systems refuse replaced. */
export function csvFileName(title: string): string {
  const name = title.replace(/[/\\?%*:|"<>]/g, '-').trim();
  return `${name === '' ? 'chart' : name}.csv`;
}

/**
 * The byte-order mark prepended to a CSV so a spreadsheet reads it as UTF-8:
 * papaparse's `Papa.BYTE_ORDER_MARK`, which `unparse` does not write itself
 * (research/supporting-utilities.md §3).
 */
export const BYTE_ORDER_MARK = '﻿';

/** What Copy writes to (T271): the browser's clipboard, or a test's. */
export interface CopyTarget {
  writeText(text: string): Promise<void>;
  write(items: ClipboardItem[]): Promise<void>;
}

/**
 * The page's clipboard where it can be written, or null (research/
 * clipboard-and-image-export.md, "Support detection"): only on a secure page
 * — HTTPS, or localhost — does a browser offer one at all.
 */
export function pageClipboard(): CopyTarget | null {
  if (typeof window === 'undefined' || !window.isSecureContext) return null;
  if (!('clipboard' in navigator)) return null;
  return navigator.clipboard;
}

/** Whether this browser can put a PNG on the clipboard (the research's detection). */
function copiesImages(): boolean {
  return (
    typeof ClipboardItem === 'function' &&
    (!('supports' in ClipboardItem) || ClipboardItem.supports('image/png'))
  );
}

export const NO_CLIPBOARD = 'Copying needs a secure page: HTTPS, or localhost.';
/** Why a failed tile's menu has nothing to copy or export (T251). */
const FAILED = 'The chart could not be loaded, so nothing is drawn to copy or export.';

/** A time grain as the Drill by submenu says it. */
const BY_GRAIN: Readonly<Record<string, string>> = {
  year: 'By year',
  quarter: 'By quarter',
  month: 'By month',
  week: 'By week',
  day: 'By day',
};

/**
 * The Drill by submenu (T270, AC-237), as the context-menu mockup draws it:
 * what's drilled, then the options in `drillOptions`' order, grouped — the
 * hierarchy's next level, each time dimension's grains, then each cube's
 * dimensions, "via join" for another cube's.
 */
function drillEntries(
  items: string,
  options: readonly DrillOption[],
  onDrill: (option: DrillOption) => void,
): MenuEntry[] {
  const head: MenuEntry = { kind: 'text', key: 'drill-what', text: `Drill ${items} by` };
  if (options.length === 0)
    return [
      head,
      { kind: 'text', key: 'drill-none', text: 'The model offers nothing else to group these by.' },
    ];
  const groups = new Map<string, { label: string; options: DrillOption[] }>();
  for (const option of options) {
    const label =
      option.kind === 'level'
        ? 'Hierarchy'
        : option.kind === 'time'
          ? `Time · ${option.title}`
          : option.from.joined
            ? `${option.from.title} · via join`
            : option.from.title;
    const key = `${option.kind}:${option.kind === 'time' ? option.member : option.from.cube}`;
    const group = groups.get(key) ?? { label, options: [] };
    group.options.push(option);
    groups.set(key, group);
  }
  return [
    head,
    ...[...groups.entries()].map(([key, group]): MenuEntry => ({
      kind: 'group',
      key: `drill-${key}`,
      label: group.label,
      entries: group.options.map((option) => ({
        kind: 'item',
        key: `${option.member}:${option.granularity ?? ''}`,
        label:
          option.granularity === undefined
            ? option.title
            : (BY_GRAIN[option.granularity] ?? option.granularity),
        onSelect: () => {
          onDrill(option);
        },
      })),
    })),
  ];
}

/** Hands the browser a file to save: a Blob behind a link, clicked once. */
export function saveFile(name: string, data: string | Blob, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Let go of the file a while after: nothing sourced says when a browser has
  // finished reading it, and a minute is well past a click's download starting.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A chart tile's ⋯ menu in view mode, as the prototype's is: "Download CSV"
 * (T177, AC-171) — the tile's table, every row and column as it shows them
 * (`csvOf`), its Table view for a chart (AC-178).
 * A disclosure, like the edit-mode menu (`MoveToMenu`): Escape closes it and
 * gives focus back, and a press elsewhere dismisses it.
 */
export function TileViewMenu({
  tileId,
  title,
  spec,
  asking = false,
  countRows,
  save = saveFile,
  tableView = false,
  onTableView,
  onViewQuery,
  onEditChart,
  onViewRows,
  marked,
  openAt,
  clipboard,
  onCopyToDashboard,
  undrawn,
  dataAsOf,
}: {
  /**
   * The Data as of submenu (T273, AC-245): its label and what it holds
   * (`dataAsOf`), asked only while the menu is open. Absent, or answering
   * nothing, before there is an answer to date.
   */
  dataAsOf?: (() => { label: string; entries: MenuEntry[] } | undefined) | undefined;
  /**
   * Why the tile draws no chart just now — a limited tile waiting for a
   * marking — so there is no image of it to make (T272's review).
   */
  undrawn?: string | undefined;
  /**
   * Where Copy writes (T271): the page's clipboard unless a test says; null
   * where there is none, which Copy then says.
   */
  clipboard?: CopyTarget | null;
  /** Copy › To dashboard (T271, AC-243): the dialog that picks one. */
  onCopyToDashboard?: (() => void) | undefined;
  /**
   * A request to open, from a right-click on the chart (`at` the pointer) or
   * Shift+F10 or the Menu key on the focused tile (under ⋯) — T266, AC-246.
   * A new `seq` is a new request.
   */
  openAt?: { readonly seq: number; readonly at?: { x: number; y: number } } | undefined;
  tileId: string;
  title: string;
  /**
   * What the tile draws — undefined for a tile whose chart failed to load,
   * which keeps its menu (T251; recheck-dashboard F10): its query to view and
   * its chart to edit, with nothing drawn to copy or export, said so.
   */
  spec: RenderSpec | undefined;
  /**
   * A newer answer is on its way — a filter just changed, a refresh — and
   * what is drawn is the one before it: not downloaded, since the file would
   * hold rows the filter now excludes (T177's review).
   */
  asking?: boolean;
  /**
   * The tile's query asked again with `total` (T178): the rows Cube returns
   * for it and its full count, from the one answer so they cannot disagree;
   * undefined when they cannot be had.
   */
  countRows?:
    ((signal: AbortSignal) => Promise<{ returned: number; total: number } | undefined>) | undefined;
  /** How the file is handed over; the browser's download unless a test says. */
  save?: (name: string, data: string | Blob, type?: string) => void;
  /** Whether the tile shows its table (AC-178), and switching it (AC-199). */
  tableView?: boolean;
  onTableView?: ((showing: boolean) => void) | undefined;
  /** The Cube query and SQL behind the tile (AC-199). */
  onViewQuery?: (() => void) | undefined;
  /** The chart editor, on this tile's chart (AC-199). */
  onEditChart?: (() => void) | undefined;
  /**
   * View underlying rows (T268, AC-239): the rows behind the whole tile,
   * offered where nothing on it is marked — the marked group's View marked
   * rows takes its place when something is.
   */
  onViewRows?: (() => void) | undefined;
  /**
   * In Markings mode, the tile's marking: the marked-rows group, headed by
   * its name and count (AC-199). Absent in any other mode.
   */
  marked?:
    | {
        name: string;
        /**
         * How many the marking holds: what Unmark and View marked rows go by,
         * since both act on the marking, not on this tile (T267's review).
         */
        count: number;
        /** What it holds, by the members' titles (AC-247): "Country: Norway, Spain". */
        values?: string | undefined;
        /**
         * How many of the tile's own items are marked, of how many (AC-247),
         * where they can be counted. Asked only while the menu is open: it
         * reads every item the tile draws (T267's review).
         */
        onTile?: (() => { readonly marked: number; readonly of: number } | undefined) | undefined;
        onUnmark: () => void;
        /**
         * Filter to marked and Filter out marked (AC-113): the action, or
         * why the marking cannot be one (nothing marked, every row marked).
         */
        filterTo?: (() => void) | { readonly refused: string } | undefined;
        filterOut?: (() => void) | { readonly refused: string } | undefined;
        /** The rows behind the marked items (T120, AC-114). */
        onViewMarkedRows?: (() => void) | undefined;
        /**
         * Those rows pinned open beside the dashboard, following the marking
         * (T269, AC-240): whether it's on for this tile, and its switch.
         */
        detailsPanel?: { readonly on: boolean; readonly onToggle: () => void } | undefined;
        /**
         * Drill by (T270, AC-236, AC-237): the marked items, as the submenu
         * heads them, what they can be regrouped by — asked only while the
         * menu is open — and the tile drilled.
         */
        drillBy?:
          | {
              readonly items: string;
              readonly options: () => readonly DrillOption[];
              readonly onDrill: (option: DrillOption) => void;
            }
          | undefined;
        /**
         * The marked items' values as tab-separated text, headed by the
         * members' titles, for Copy › Marked values (T271, AC-241).
         */
        valuesTsv?: (() => string) | undefined;
        /**
         * Those rows as CSV, for Export › Marked rows CSV (T272, AC-244): as
         * the rows dialog writes them, with how many and of how many.
         */
        exportRows?:
          | ((
              signal: AbortSignal,
            ) => Promise<{ text: string; written: number; total: number | undefined }>)
          | undefined;
        /** Invert marking and Mark all on this tile (AC-115), where it has items to name. */
        onInvert?: (() => void) | undefined;
        onMarkAll?: (() => void) | undefined;
        /** A tile beside this one, limited by its marking (AC-112). */
        onCreateDetails?: (() => void) | undefined;
      }
    | undefined;
}) {
  const [open, setOpen] = useState(false);
  /**
   * What the last download holds (T178, AC-172): how many rows, and whether
   * they are the whole result — said once Cube has counted, and never claimed
   * whole before then.
   */
  const [note, setNote] = useState<{ kind: StateKind; text: string } | undefined>(undefined);
  const noteRef = useRef<HTMLParagraphElement>(null);
  // It lies over the tile, so it goes on Escape or a press anywhere but on it.
  const noted = note !== undefined;
  useEffect(() => {
    if (!noted) return undefined;
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (noteRef.current?.contains(event.target as Node) === true) return;
      setNote(undefined);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [noted]);

  /**
   * Only the latest download's count is said (T178's review): each new one
   * lets go of the one before, so an earlier answer arriving late cannot say
   * of this file what was true of the last.
   */
  const counting = useRef<AbortController | null>(null);
  useEffect(() => () => counting.current?.abort(), []);
  /** A marked-rows export being read (T272), stopped only by the next one or by leaving. */
  const exporting = useRef<AbortController | null>(null);
  useEffect(() => () => exporting.current?.abort(), []);
  const download = () => {
    if (spec === undefined) return;
    const written = spec.rows.length;
    save(csvFileName(title), `${BYTE_ORDER_MARK}${csvOf(spec)}`);
    setNote({
      kind: 'run',
      text: `Downloaded ${rowsText(written)}. Asking Cube whether any were cut short…`,
    });
    counting.current?.abort();
    const mine = new AbortController();
    counting.current = mine;
    void (countRows?.(mine.signal) ?? Promise.resolve(undefined))
      .catch(() => undefined)
      .then((counted) => {
        if (mine.signal.aborted) return;
        // Said even if the note was put away meanwhile: a truncation is news.
        const said = exportNoteOf({ written, returned: counted?.returned, total: counted?.total });
        // Whole: done. Cut short, or not known to be whole: a warning (AC-177).
        setNote({ kind: said.truncated === false ? 'ok' : 'warn', text: said.text });
      });
  };
  /**
   * Export › Marked rows CSV (T272, AC-244): the rows behind the marked
   * items, as the rows dialog downloads them (T120), and what the file holds.
   */
  const exportMarkedRows = (exportRows: NonNullable<NonNullable<typeof marked>['exportRows']>) => {
    setNote({ kind: 'run', text: 'Reading the marked rows…' });
    // Its own: a CSV download chosen meanwhile must not cancel this file,
    // only say its own note after it (T272's review).
    exporting.current?.abort();
    const mine = new AbortController();
    exporting.current = mine;
    exportRows(mine.signal).then(
      ({ text, written, total }) => {
        if (mine.signal.aborted) return;
        save(csvFileName(`${title} - marked rows`), `${BYTE_ORDER_MARK}${text}`);
        const said = exportNoteOf({ written, returned: written, total });
        setNote({ kind: said.truncated === false ? 'ok' : 'warn', text: said.text });
      },
      (error: unknown) => {
        if (mine.signal.aborted) return;
        setNote({
          kind: 'err',
          text: error instanceof Error ? error.message : 'The marked rows could not be read.',
        });
      },
    );
  };
  /**
   * Export › SVG image and PNG image (T272, AC-244): the chart as ECharts
   * drew it, on the tile's surface — the SVG at its size, the PNG at the
   * screen's pixel ratio, as it is drawn (research open question 2, decided
   * so by T272).
   */
  const exportImage = (extension: 'svg' | 'png') => {
    const tile = document.querySelector(`[data-tile="${CSS.escape(tileId)}"]`);
    const chart = drawnChartIn(tile);
    if (chart === undefined) {
      setNote({ kind: 'err', text: 'The chart is not drawn yet, so there is no image of it.' });
      return;
    }
    const surface = surfaceOf(tile?.querySelector('[data-testid="chart-canvas"]'));
    const name = imageFileName(title, extension);
    try {
      if (extension === 'svg') {
        save(name, chartSvg(chart, { surface }).svg, 'image/svg+xml');
        setNote({ kind: 'ok', text: 'Downloaded the chart as an SVG image.' });
        return;
      }
      setNote({ kind: 'run', text: 'Drawing the chart as a PNG image…' });
      svgToPng(chartSvg(chart, { pixelRatio: window.devicePixelRatio, surface })).then(
        (png) => {
          save(name, png, 'image/png');
          setNote({ kind: 'ok', text: 'Downloaded the chart as a PNG image.' });
        },
        (error: unknown) => {
          setNote({
            kind: 'err',
            text: error instanceof Error ? error.message : 'The PNG could not be made.',
          });
        },
      );
    } catch (error) {
      setNote({
        kind: 'err',
        text: error instanceof Error ? error.message : 'The image could not be made.',
      });
    }
  };
  /**
   * Copy (T271). Where it writes: the page's clipboard unless a test gave
   * one, and none on a page that is not secure, which the items then say.
   * Each writes inside the click that chose it, with nothing awaited first —
   * Safari refuses a write outside a gesture (the research's gotcha).
   */
  const target = clipboard === undefined ? pageClipboard() : clipboard;
  const copyMarkedValues = () => {
    const text = marked?.valuesTsv?.() ?? '';
    // Nothing to copy — a whole tile's items no longer drawn, say — leaves
    // the clipboard as it was, and says so (T271's review).
    if (text === '') {
      setNote({
        kind: 'warn',
        text: 'Nothing marked is drawn to copy; the clipboard is unchanged.',
      });
      return;
    }
    const lines = text.split('\n').length - 1;
    target?.writeText(text).then(
      () => {
        setNote({
          kind: 'ok',
          text: `Copied ${lines.toLocaleString('en-GB')} marked ${lines === 1 ? 'value' : 'values'}.`,
        });
      },
      (error: unknown) => {
        setNote({
          kind: 'err',
          text: `Could not copy: ${error instanceof Error ? error.message : 'the browser refused'}.`,
        });
      },
    );
  };
  /**
   * Copy › Image (AC-242): the PNG Export makes, handed to the clipboard as
   * a promise inside the click, so the rasterising happens after the write
   * has its gesture (the research's Safari recipe).
   */
  const copyImage = () => {
    const tile = document.querySelector(`[data-tile="${CSS.escape(tileId)}"]`);
    const chart = drawnChartIn(tile);
    if (chart === undefined || target === null) {
      setNote({ kind: 'err', text: 'The chart is not drawn yet, so there is no image of it.' });
      return;
    }
    const surface = surfaceOf(tile?.querySelector('[data-testid="chart-canvas"]'));
    let png: Promise<Blob>;
    try {
      png = svgToPng(chartSvg(chart, { pixelRatio: window.devicePixelRatio, surface }));
    } catch (error) {
      setNote({
        kind: 'err',
        text: error instanceof Error ? error.message : 'The image could not be made.',
      });
      return;
    }
    target.write([new ClipboardItem({ 'image/png': png })]).then(
      () => {
        setNote({ kind: 'ok', text: 'Copied the chart as an image.' });
      },
      (error: unknown) => {
        setNote({
          kind: 'err',
          text: `Could not copy the image: ${
            error instanceof Error ? error.message : 'the browser refused'
          }. Export › PNG image downloads it instead.`,
        });
      },
    );
  };
  /** Why a tile has no image to export: it is drawn as text, not by ECharts. */
  const imageless =
    spec === undefined
      ? FAILED
      : tableView
        ? 'Shown as a table: view it as a chart to export its image.'
        : ['kpi', 'table', 'pivot'].includes(spec.chartType)
          ? 'A KPI, table or pivot is drawn as text, not as a chart image.'
          : // Nothing drawn: a limited tile waiting, or an answer with no rows
            // (T272's review: offered, then "not drawn yet" when chosen).
            (undrawn ??
            (spec.rows.length === 0
              ? 'The tile has no rows drawn, so there is no image of it.'
              : undefined));
  const trigger = useRef<HTMLButtonElement>(null);
  const why = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  /** Where it opens: at the pointer of a right-click, or under ⋯ (or the tile, by keyboard). */
  const [point, setPoint] = useState<{ x: number; y: number } | undefined>(undefined);

  /**
   * Opened from elsewhere (T266, AC-246): a right-click on the chart, at the
   * pointer, or Shift+F10 or the Menu key on the focused tile, at the tile.
   * Each request once, by its number.
   */
  const answered = useRef(openAt?.seq);
  /** Opened from the focused tile by its keys: focus goes back to it (APG). */
  const fromTile = useRef(false);
  useEffect(() => {
    if (openAt === undefined || openAt.seq === answered.current) return;
    answered.current = openAt.seq;
    fromTile.current = openAt.at === undefined;
    setNote(undefined);
    setPoint(openAt.at);
    setOpen(true);
  }, [openAt]);

  /**
   * Shown in the top layer and placed in the window: at the pointer, or
   * under ⋯ at its right edge, turned back from any edge it would cross.
   */
  useLayoutEffect(() => {
    const box = popup.current;
    if (!open || box === null) return;
    if (typeof box.showPopover === 'function' && !box.matches(':popover-open')) box.showPopover();
    const size = box.getBoundingClientRect();
    const anchor = trigger.current?.getBoundingClientRect();
    // Within the dashboard's canvas where it has one, as the picker always
    // opened (T253's review, finding 1), and within the window in any case.
    const canvas = wrapper.current?.closest('.dashboard__canvas')?.getBoundingClientRect();
    const [lowest, highest] = [
      Math.max(8, canvas?.left ?? 0),
      Math.min(window.innerWidth - 8, canvas?.right ?? window.innerWidth),
    ];
    let left = point?.x ?? (anchor === undefined ? 0 : anchor.right - size.width);
    let top = point?.y ?? (anchor === undefined ? 0 : anchor.bottom + 4);
    if (point !== undefined && left + size.width > highest) left -= size.width;
    left = Math.min(Math.max(left, lowest), highest - size.width);
    if (top + size.height > window.innerHeight - 8) {
      top = Math.max(8, (point?.y ?? anchor?.top ?? top) - size.height - 4);
    }
    box.style.left = `${String(Math.max(8, left))}px`;
    box.style.top = `${String(Math.max(8, top))}px`;
  }, [open, point]);

  // A press anywhere else puts it away.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node) === true) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  /** Runs one of its actions; the menu closes itself after (`Menu`). */
  const entries: MenuEntry[] = [
    // The marked-rows group first, as the prototype's: under the heading
    // naming the tile's marking and how much it holds (AC-199). Shown with
    // nothing marked too: Unmark is then unavailable, while Invert, Mark all
    // and Create details tile still have something to do.
    ...(marked === undefined
      ? []
      : [
          {
            kind: 'group' as const,
            key: 'marked',
            labelledBy: `${why}-marked`,
            entries: [
              // The marking as a dashboard filter, or its negation, which then
              // clears it (AC-113, direction.md rule 53).
              ...(
                [
                  ['to', 'Filter to marked', marked.filterTo],
                  ['out', 'Filter out marked', marked.filterOut],
                ] as const
              ).flatMap(([key, label, action]): MenuEntry[] =>
                action === undefined
                  ? []
                  : [
                      {
                        kind: 'item',
                        key,
                        label,
                        onSelect: typeof action === 'function' ? action : () => undefined,
                        disabled: typeof action === 'function' ? undefined : action.refused,
                      },
                    ],
              ),
              ...(marked.onViewMarkedRows === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'rows',
                      label: 'View marked rows',
                      onSelect: marked.onViewMarkedRows,
                      disabled: marked.count === 0 ? 'Nothing is marked.' : undefined,
                    },
                  ]),
              // Offered with nothing marked too, and said why it can't be used,
              // so the menu keeps its shape (the mockup's state H).
              ...(marked.drillBy === undefined
                ? []
                : [
                    {
                      kind: 'submenu' as const,
                      key: 'drill',
                      label: 'Drill by',
                      disabled: marked.count === 0 ? 'Mark something to drill into.' : undefined,
                      entries:
                        open && marked.count > 0
                          ? drillEntries(
                              marked.drillBy.items,
                              marked.drillBy.options(),
                              (option) => {
                                marked.drillBy?.onDrill(option);
                              },
                            )
                          : [],
                    },
                  ]),
              // Offered with nothing marked too: the panel says so, and fills
              // as the marking does.
              ...(marked.detailsPanel === undefined
                ? []
                : [
                    {
                      kind: 'checkbox' as const,
                      key: 'details-panel',
                      label: 'Details panel',
                      checked: marked.detailsPanel.on,
                      onToggle: marked.detailsPanel.onToggle,
                    },
                  ]),
              // On this tile's items alone, other tiles' left as they are
              // (AC-115); offered where the tile has items to name.
              ...(marked.onInvert === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'invert',
                      label: 'Invert marking',
                      onSelect: marked.onInvert,
                    },
                  ]),
              ...(marked.onMarkAll === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'all',
                      label: 'Mark all',
                      onSelect: marked.onMarkAll,
                    },
                  ]),
              {
                kind: 'item' as const,
                key: 'unmark',
                label: 'Unmark',
                onSelect: marked.onUnmark,
                disabled: marked.count === 0 ? 'Nothing is marked.' : undefined,
              },
              ...(marked.onCreateDetails === undefined
                ? []
                : [
                    {
                      kind: 'item' as const,
                      key: 'details',
                      label: 'Create details tile',
                      onSelect: marked.onCreateDetails,
                    },
                  ]),
            ],
          },
          { kind: 'separator' as const, key: 'after-marked' },
        ]),
    ...(onTableView === undefined
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'table',
            label: tableView ? 'View as chart' : 'View as table',
            onSelect: () => {
              onTableView(!tableView);
            },
          },
        ]),
    ...(onViewRows === undefined || (marked !== undefined && marked.count > 0)
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'underlying',
            label: 'View underlying rows',
            onSelect: onViewRows,
          },
        ]),
    ...(onViewQuery === undefined
      ? []
      : [{ kind: 'item' as const, key: 'query', label: 'View query', onSelect: onViewQuery }]),
    // Copy (T271; the mockup's): the marked values as text, the chart as an
    // image, or the chart onto another dashboard.
    {
      kind: 'submenu',
      key: 'copy',
      label: 'Copy',
      entries: [
        ...(marked?.valuesTsv === undefined
          ? []
          : [
              {
                kind: 'item' as const,
                key: 'copy-marked',
                label: 'Marked values',
                onSelect: copyMarkedValues,
                disabled:
                  target === null
                    ? NO_CLIPBOARD
                    : marked.count === 0
                      ? 'Nothing is marked.'
                      : undefined,
              },
            ]),
        {
          kind: 'item',
          key: 'copy-image',
          label: 'Image',
          onSelect: copyImage,
          // A KPI, table or pivot has no chart image (AC-242), and a page
          // with no clipboard nothing to put one on.
          disabled:
            imageless ??
            (target === null || !copiesImages()
              ? NO_CLIPBOARD
              : asking
                ? 'Its newest answer is still on its way.'
                : undefined),
          describedBy: imageless === undefined && target !== null && asking ? why : undefined,
        },
        ...(onCopyToDashboard === undefined
          ? []
          : [
              {
                kind: 'item' as const,
                key: 'copy-to',
                label: 'To dashboard…',
                onSelect: onCopyToDashboard,
              },
            ]),
      ],
    },
    // Export (T272, AC-244; the mockup's): the tile's CSV, where Download CSV
    // was, its marked rows' while it holds any, and the chart as drawn.
    {
      kind: 'submenu',
      key: 'export',
      label: 'Export',
      entries: [
        {
          kind: 'item',
          key: 'csv',
          label: 'CSV',
          // The tile's table, as it writes it, with the mark that tells a
          // spreadsheet it is UTF-8 — and then what it holds.
          onSelect: download,
          disabled:
            spec === undefined
              ? FAILED
              : asking
                ? 'Its newest answer is still on its way.'
                : undefined,
          // Said in words beside it, which it is described by (T182, AC-176).
          describedBy: asking ? why : undefined,
        },
        ...(marked?.exportRows === undefined || marked.count === 0
          ? []
          : [
              {
                kind: 'item' as const,
                key: 'marked-csv',
                label: 'Marked rows CSV',
                onSelect: () => {
                  if (marked.exportRows !== undefined) exportMarkedRows(marked.exportRows);
                },
              },
            ]),
        ...(['svg', 'png'] as const).map((extension): MenuEntry => ({
          kind: 'item',
          key: extension,
          label: `${extension.toUpperCase()} image`,
          onSelect: () => {
            exportImage(extension);
          },
          // The chart as drawn: none while an answer that replaces it is on
          // its way, as the CSV; none of a tile drawn as text.
          disabled: imageless ?? (asking ? 'Its newest answer is still on its way.' : undefined),
          describedBy: imageless === undefined && asking ? why : undefined,
        })),
      ],
    },
    ...(onEditChart === undefined
      ? []
      : [{ kind: 'item' as const, key: 'edit', label: 'Edit chart', onSelect: onEditChart }]),
    // Last, as the mockup's footer: how fresh the answer is, and where that
    // is set (T273, AC-245). Read only while the menu is open.
    ...((): MenuEntry[] => {
      const said = open ? dataAsOf?.() : undefined;
      return said === undefined
        ? []
        : [
            { kind: 'separator', key: 'before-as-of' },
            { kind: 'submenu', key: 'as-of', label: said.label, entries: said.entries },
          ];
    })(),
  ];

  return (
    <div className="tile-menu" ref={wrapper}>
      <button
        type="button"
        ref={trigger}
        id={`${why}-trigger`}
        aria-label={`Actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`tile-view-menu-${tileId}`}
        // What focus returns to when View query closes: its own attribute, so
        // a build that stripped test ids would not lose it.
        data-view-menu={tileId}
        onClick={() => {
          // The menu and the note share the place under ⋯: opening it puts
          // the note away, so neither covers the other.
          setNote(undefined);
          setPoint(undefined);
          fromTile.current = false;
          setOpen((was) => !was);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        // Its handlers keep focus and the browser's menu off it; the menu in
        // it takes every key and click (`Menu`).
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          className="tile-view-menu"
          ref={popup}
          // In the top layer (research/context-menu-and-submenus.md §6): a
          // right-click opens it at the pointer, clear of the tile's box and
          // of any transform above it, while it stays in the tile's DOM.
          // Only where it can be shown: a popover not shown is not drawn.
          popover={CAN_POP ? 'manual' : undefined}
          // A press on its heading or its padding leaves focus on the item it
          // was on, where the menu's keys — Escape among them — are taken
          // (T266's review: it went to the tile, and Escape unmarked it).
          onMouseDown={(event) => {
            if ((event.target as Element).closest('[role^="menuitem"]') === null)
              event.preventDefault();
          }}
          // Never the browser's menu over this one (AC-246; research gotcha
          // 2): a right-click on it, or the Menu key's `contextmenu`, which
          // Chromium on Windows fires on its keyup — at the item this menu
          // has just focused.
          onContextMenu={(event) => {
            event.preventDefault();
          }}
        >
          {/* The marked-rows group's heading, outside the menu itself, which
              holds items only (APG): the tile's marking and how much it holds
              (AC-199). */}
          {marked === undefined ? null : (
            <div id={`${why}-marked`} className="tile-menu__heading">
              <span aria-hidden="true">● </span>
              {/* The marking, what it holds by the members' titles, and how
                  many of the tile's items (AC-247; the mockup's "Region =
                  West, East · 2 of 6"). */}
              {(() => {
                const own = marked.onTile?.();
                return [
                  marked.name,
                  ...(marked.values === undefined || marked.values === '' ? [] : [marked.values]),
                  own === undefined
                    ? `${marked.count.toLocaleString('en-GB')} marked`
                    : `${own.marked.toLocaleString('en-GB')} of ${own.of.toLocaleString('en-GB')} marked`,
                ].join(' · ');
              })()}
            </div>
          )}
          <Menu
            labelledBy={`${why}-trigger`}
            entries={entries}
            onClose={() => {
              setOpen(false);
              // Back to where it was opened from (APG): the tile, for its
              // keys; ⋯ otherwise — before a dialog an item opened takes
              // focus, and before Tab moves on from it.
              const tile = wrapper.current?.closest<HTMLElement>('[data-tile]');
              if (fromTile.current && tile !== null && tile !== undefined) tile.focus();
              else trigger.current?.focus();
              fromTile.current = false;
            }}
          />
          {/* Why Download is off, in words (T182, AC-176). */}
          {asking ? (
            <StateLine kind="run" className="tile-menu__why" id={why}>
              Its newest answer is still on its way.
            </StateLine>
          ) : null}
        </div>
      ) : null}
      {/* Always there, so each message is announced as it changes. */}
      <p
        ref={noteRef}
        className={note === undefined ? 'visually-hidden' : 'tile-export-note'}
        role="status"
      >
        {note === undefined ? (
          ''
        ) : (
          <>
            <StatusIcon kind={note.kind} />
            {note.text}
          </>
        )}
      </p>
    </div>
  );
}
