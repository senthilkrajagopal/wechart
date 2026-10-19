import { chartTilesOf, textTilesOf, tileName } from '../../filters/scope';
import { pairKey } from '../crossfilter/apply';
import { nameOfTile, type DashboardDocument } from '../model/document';
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

/** Why a Text tile can't be highlighted (AC-523; design 21 state H). */
const NO_MARKS = 'Text has no marks to highlight';

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
  /**
   * Only tiles a click can actually reach: a chart tile with no chart yet is
   * a saved shape (`model/document.ts`), and nothing cross-filters through
   * it, so offering a control for it would be a control that does nothing
   * (T124's review).
   */
  const tiles = chartTilesOf(document).filter((tile) => tile.chartId !== undefined);
  const drawnTwice = new Set(
    tiles.map((tile) => tile.chartId).filter((chartId, at, all) => all.indexOf(chartId) !== at),
  );
  /**
   * Named by the chart it draws, as the filter bar names a tile. Where one
   * chart is on two tiles the titles would be the same word twice, which
   * neither a reader nor a screen reader could tell apart, so the tile's own
   * id settles it.
   */
  const nameOf = (tile: { tileId: string; chartId?: string | undefined }) => {
    const name = tileName(tile as Parameters<typeof tileName>[0], (id) => titleOf?.(id));
    return drawnTwice.has(tile.chartId) ? `${name} (${tile.tileId})` : name;
  };

  const setPair = (source: string, target: string, action: PairAction) => {
    const key = pairKey(source, target);
    const next = { ...pairs };
    // Back to following the default, rather than stored as what the default
    // happens to be now.
    if (action === defaultAction) delete next[key];
    else next[key] = action;
    onChange(Object.keys(next).length === 0 ? { defaultAction } : { defaultAction, pairs: next });
  };

  /**
   * Each page's own matrix: a click reaches the tiles on its tab (rule 13).
   * Its Text tiles are columns only: a target set to Filter or None, never a
   * source, since text has no marks to click (AC-523).
   */
  const texts = textTilesOf(document);
  const pages = document.pages.map((page) => ({
    page,
    tiles: tiles.filter((tile) => tile.pageId === page.id),
    texts: texts.filter((tile) => tile.pageId === page.id),
  }));
  /** A Text tile's cell: what a click does to it, Highlight read as Filter (AC-523). */
  const textAction = (source: string, target: string): PairAction => {
    const action = pairs?.[pairKey(source, target)] ?? defaultAction;
    return action === 'highlight' ? 'filter' : action;
  };

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
                // Choosing what is already chosen changes nothing, and must
                // not make a clean dashboard dirty: the mode switch beside it
                // keeps the same rule (AC-074, and T124's review).
                if (value === defaultAction) return;
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

      {pages.map(({ page, tiles: on, texts: onText }) =>
        on.length === 0 || on.length + onText.length < 2 ? null : (
          <section key={page.id} aria-label={`Tile pairs on ${page.title}`}>
            {document.pages.length > 1 ? <h3>{page.title}</h3> : null}
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th scope="col">Source ↓ · Target →</th>
                    {on.map((target) => (
                      <th key={target.tileId} scope="col">
                        {nameOf(target)}
                      </th>
                    ))}
                    {onText.map((target) => (
                      <th key={target.tileId} scope="col">
                        {nameOfTile(document, target.tileId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {on.map((source) => (
                    <tr key={source.tileId}>
                      <th scope="row">{nameOf(source)}</th>
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
                              aria-label={`${nameOf(source)} to ${nameOf(target)}`}
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
                      {onText.map((target) => {
                        const name = nameOfTile(document, target.tileId);
                        return (
                          <td key={target.tileId}>
                            <select
                              className="select-sm"
                              aria-label={`${nameOf(source)} to ${name}`}
                              value={textAction(source.tileId, target.tileId)}
                              onChange={(event) => {
                                setPair(
                                  source.tileId,
                                  target.tileId,
                                  event.target.value as PairAction,
                                );
                              }}
                            >
                              {/* Highlight's reason is its own words, read and seen in the list. */}
                              {ACTIONS.map(({ value, label }) => (
                                <option key={value} value={value} disabled={value === 'highlight'}>
                                  {value === 'highlight' ? `${label}: ${NO_MARKS}` : label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
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
