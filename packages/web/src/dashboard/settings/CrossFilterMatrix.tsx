import { chartTilesOf } from '../../filters/scope';
import { pairKey } from '../crossfilter/apply';
import type { DashboardDocument } from '../model/document';
import type { CrossFilterConfig, Interactions, PairAction } from './interactionMode';

/**
 * Settings › Cross-filtering (AC-118, direction.md rule 32): the default
 * action for tile pairs, and the source → target matrix that overrides it.
 *
 * The matrix is the prototype's (`docs/design/prototype/dash-settings.js`):
 * a row per source tile, a column per target, a select in each cell, and a
 * dash on the diagonal, since a tile never acts on itself.
 *
 * **Pairs are stored sparsely.** A pair nobody has set is not written, so it
 * follows the default rather than being frozen at whatever the default was
 * when the page was opened — which is exactly what AC-118 asks for, and what
 * makes changing the default meaningful.
 */
const ACTIONS: readonly { readonly value: PairAction; readonly label: string }[] = [
  { value: 'filter', label: 'Filter' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'none', label: 'None' },
];

export interface CrossFilterMatrixProps {
  readonly document: DashboardDocument;
  readonly interactions: Interactions;
  readonly onChange: (crossFilter: CrossFilterConfig) => void;
  /** A chart's title, which is how a tile is named here. */
  readonly titleOf?: ((chartId: string) => string | undefined) | undefined;
}

export function CrossFilterMatrix({
  document,
  interactions,
  onChange,
  titleOf,
}: CrossFilterMatrixProps) {
  const { defaultAction, pairs } = interactions.crossFilter;
  const tiles = chartTilesOf(document);
  const nameOf = (tileId: string, chartId: string | undefined) =>
    (chartId === undefined ? undefined : titleOf?.(chartId)) ?? tileId;

  const setPair = (source: string, target: string, action: PairAction) => {
    const key = pairKey(source, target);
    const next = { ...pairs };
    // Back to following the default, rather than stored as what the default
    // happens to be now.
    if (action === defaultAction) delete next[key];
    else next[key] = action;
    onChange(Object.keys(next).length === 0 ? { defaultAction } : { defaultAction, pairs: next });
  };

  /** Each page's own matrix: a click reaches the tiles on its tab (rule 13). */
  const pages = document.pages.map((page) => ({
    page,
    tiles: tiles.filter((tile) => tile.pageId === page.id),
  }));

  return (
    <>
      <div className="settings-field">
        <span className="settings-field__label">Default for tile pairs</span>
        <div className="seg" role="group" aria-label="Default for tile pairs">
          {ACTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === defaultAction}
              onClick={() => {
                // The pairs set by hand stay as they are; the rest follow.
                onChange({
                  defaultAction: value,
                  ...(pairs === undefined ? {} : { pairs }),
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="settings-page__note">
        What a click in the source tile (row) does to each target tile (column).
      </p>

      {pages.map(({ page, tiles: on }) =>
        on.length < 2 ? null : (
          <section key={page.id} aria-label={`Tile pairs on ${page.title}`}>
            {document.pages.length > 1 ? <h3>{page.title}</h3> : null}
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th scope="col">Source ↓ · Target →</th>
                    {on.map((target) => (
                      <th key={target.tileId} scope="col">
                        {nameOf(target.tileId, target.chartId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {on.map((source) => (
                    <tr key={source.tileId}>
                      <th scope="row">{nameOf(source.tileId, source.chartId)}</th>
                      {on.map((target) =>
                        source.tileId === target.tileId ? (
                          <td key={target.tileId} className="grid-table__self">
                            {/* A tile never acts on itself. */}
                            <span aria-label="Not a pair">–</span>
                          </td>
                        ) : (
                          <td key={target.tileId}>
                            <select
                              className="select-sm"
                              aria-label={`${nameOf(source.tileId, source.chartId)} to ${nameOf(target.tileId, target.chartId)}`}
                              value={
                                pairs?.[pairKey(source.tileId, target.tileId)] ?? defaultAction
                              }
                              onChange={(event) => {
                                setPair(
                                  source.tileId,
                                  target.tileId,
                                  event.target.value as PairAction,
                                );
                              }}
                            >
                              {ACTIONS.map(({ value, label }) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ),
      )}
    </>
  );
}
