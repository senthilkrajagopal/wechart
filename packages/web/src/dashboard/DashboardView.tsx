import type { RenderSpec } from '@wechart/core';
import { useState, type ReactNode } from 'react';

import { ChartTile } from '../tiles/ChartTile';
import { TileError } from '../tiles/TileError';
import { TileSkeleton } from '../tiles/TileSkeleton';
import { useDashboardColours } from './colours';
import { EditChrome, type EditSession } from './edit/EditChrome';
import { Canvas } from './grid/Canvas';
import { ROW_UNIT_PX } from './grid/geometry';
import {
  isSection,
  isTabGroup,
  resizeTile,
  type DashboardDocument,
  type Element_,
  type Tile,
} from './model/document';

/**
 * A saved dashboard, open for reading (AC-018).
 *
 * It takes its tiles' data as a prop, the way `FolderContents` takes its rows:
 * fetching belongs to the route. What the view owns is the structure — which
 * page is open, what is nested in what — and the colours, because AC-039 makes
 * that a dashboard-level decision rather than a tile-level one.
 */
export interface DashboardViewProps {
  readonly document: DashboardDocument;
  /** Compiled specs by chart id. The dashboard supplies their colours. */
  readonly specs: Readonly<Record<string, RenderSpec>>;
  /**
   * What went wrong, by chart id, for the charts that did not load (AC-012).
   * Separate from `specs` because "failed" and "absent" are different states
   * and a failure rendered as an absent spec draws an empty chart, which reads
   * as "no data" — the one answer it is not.
   */
  readonly errors?: Readonly<Record<string, unknown>>;
  /** The charts are still on their way, so tiles show a skeleton (AC-042). */
  readonly loading?: boolean;
  readonly onSave: (document: DashboardDocument) => void;
}

function TileBody({
  tile,
  spec,
  error,
  loading,
}: {
  tile: Tile;
  spec: RenderSpec | undefined;
  error: unknown;
  loading: boolean;
}) {
  switch (tile.kind) {
    case 'chart':
      if (error !== undefined) return <TileError error={error} />;
      /**
       * Loading, absent and broken are three states, not two. Collapsing the
       * first into the second made "this chart is no longer available" the
       * normal appearance of a healthy dashboard for as long as its queries
       * took — the missing-chart state showing on charts that were perfectly
       * fine (AC-042, AC-010).
       */
      if (loading) return <TileSkeleton chartType="bar" />;
      return spec === undefined ? (
        <p data-testid="tile-missing-chart">This chart is no longer available.</p>
      ) : (
        <ChartTile spec={spec} height={tile.h * ROW_UNIT_PX} />
      );
    case 'markdown':
      return <p>{tile.text}</p>;
    case 'header':
      return <h3>{tile.text}</h3>;
    case 'divider':
      return <hr />;
    default:
      // Image, link and filter tiles are AC-063, AC-064 and F8. The tile is
      // still rendered, because AC-018 fails when a saved tile is missing —
      // what it holds is the later task's to fill in.
      return <p data-testid={`tile-${tile.kind}`}>{tile.text ?? ''}</p>;
  }
}

/**
 * A run of elements, laid out on the grid.
 *
 * Sections and tab groups break the run: each is a container with its own
 * canvas, which is what makes the nested grammar in direction.md work as CSS
 * grid flow rather than as absolute coordinates.
 */
interface TileCharts {
  readonly specs: Readonly<Record<string, RenderSpec>>;
  readonly errors: Readonly<Record<string, unknown>>;
  readonly loading: boolean;
}

function Elements({
  items,
  editing,
  charts,
  onResize,
}: {
  items: readonly Element_[];
  editing: boolean;
  charts: TileCharts;
  onResize?: ((id: string, size: { w: number; h: number }) => void) | undefined;
}) {
  const blocks: ReactNode[] = [];
  let run: Tile[] = [];

  const flush = (key: string) => {
    if (run.length === 0) return;
    const tiles = run;
    run = [];
    blocks.push(
      <Canvas key={key} tiles={tiles} editing={editing} onResize={onResize}>
        {(tile) => {
          const chartId = (tile as Tile).chartId ?? '';
          return (
            <TileBody
              tile={tile as Tile}
              spec={charts.specs[chartId]}
              error={charts.errors[chartId]}
              loading={charts.loading}
            />
          );
        }}
      </Canvas>,
    );
  };

  for (const element of items) {
    if (isSection(element)) {
      flush(`run-before-${element.id}`);
      blocks.push(
        <section key={element.id} className="dashboard-section" data-section={element.id}>
          <h2>{element.title}</h2>
          <Elements items={element.items} editing={editing} charts={charts} onResize={onResize} />
        </section>,
      );
    } else if (isTabGroup(element)) {
      flush(`run-before-${element.id}`);
      blocks.push(
        <TabGroupView
          key={element.id}
          group={element}
          editing={editing}
          charts={charts}
          onResize={onResize}
        />,
      );
    } else {
      run.push(element);
    }
  }
  flush('run-last');

  return <>{blocks}</>;
}

function TabGroupView({
  group,
  editing,
  charts,
  onResize,
}: {
  group: Extract<Element_, { kind: 'tabs' }>;
  editing: boolean;
  charts: TileCharts;
  onResize?: ((id: string, size: { w: number; h: number }) => void) | undefined;
}) {
  const [open, setOpen] = useState(group.tabs[0]?.id ?? '');
  const showing = group.tabs.find((tab) => tab.id === open) ?? group.tabs[0];

  return (
    <div className="tab-group" data-tab-group={group.id}>
      <div role="tablist" aria-label={`Tabs in ${group.id}`}>
        {group.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === showing?.id}
            onClick={() => setOpen(tab.id)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {showing ? (
        <Elements items={showing.items} editing={editing} charts={charts} onResize={onResize} />
      ) : null}
    </div>
  );
}

export function DashboardView({
  document,
  specs,
  errors,
  loading = false,
  onSave,
}: DashboardViewProps) {
  // The assignment is held across renders, so a filter that hides a member
  // does not hand its colour to whoever is now first (AC-039).
  const coloured = useDashboardColours(document, specs);
  const charts: TileCharts = { specs: coloured, errors: errors ?? {}, loading };

  return (
    <EditChrome document={document} title={document.title} onSave={onSave}>
      {(session: EditSession<DashboardDocument>) => (
        <DashboardPages session={session} charts={charts} />
      )}
    </EditChrome>
  );
}

function DashboardPages({
  session,
  charts,
}: {
  session: EditSession<DashboardDocument>;
  charts: TileCharts;
}) {
  const { document, editing } = session;
  const [open, setOpen] = useState(document.pages[0]?.id ?? '');
  const showing = document.pages.find((page) => page.id === open) ?? document.pages[0];

  return (
    <>
      {document.pages.length > 1 ? (
        <div role="tablist" aria-label="Pages" className="page-tabs">
          {document.pages.map((page) => (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={page.id === showing?.id}
              onClick={() => setOpen(page.id)}
            >
              {page.title}
            </button>
          ))}
        </div>
      ) : null}

      <div
        data-testid="dashboard-page"
        className="dashboard-page"
        data-width={document.settings.width}
      >
        {showing ? (
          <Elements
            items={showing.items}
            editing={editing}
            charts={charts}
            /**
             * A resize is a change to the dashboard, so it goes through the
             * session rather than into local state — which is what makes it
             * undoable and what Discard reverts (AC-060, AC-066).
             */
            onResize={
              editing
                ? (id, size) => {
                    session.change(resizeTile(document, id, size));
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    </>
  );
}
