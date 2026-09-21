import type { DashboardDocument } from '../dashboard/model/document';
import type { DashboardFilter, FilterScope } from './model';
import { chartTilesOf, scopeOf, tileName } from './scope';

/**
 * Setting a filter's scope in edit mode (AC-077): the whole dashboard, one
 * page tab, or chosen chart tiles — each tile named by its chart's title and
 * the tab it is on, since two charts can share a title.
 */
export function ScopeEditor({
  filter,
  dashboard,
  chartTitleOf,
  onScope,
}: {
  filter: DashboardFilter;
  dashboard: DashboardDocument;
  chartTitleOf: (chartId: string) => string | undefined;
  onScope: (scope: FilterScope) => void;
}) {
  const scope = scopeOf(filter);
  const chosen =
    scope.kind === 'dashboard'
      ? 'dashboard'
      : scope.kind === 'page'
        ? `page:${scope.pageId}`
        : 'tiles';
  const pageTitle = (pageId: string) =>
    dashboard.pages.find((page) => page.id === pageId)?.title ?? '';

  return (
    <>
      <select
        aria-label="Applies to"
        value={chosen}
        onChange={(event) => {
          const next = event.target.value;
          if (next === 'dashboard') onScope({ kind: 'dashboard' });
          else if (next === 'tiles') onScope({ kind: 'tiles', tileIds: [] });
          else onScope({ kind: 'page', pageId: next.slice('page:'.length) });
        }}
      >
        <option value="dashboard">The whole dashboard</option>
        {dashboard.pages.map((page) => (
          <option key={page.id} value={`page:${page.id}`}>
            Tab: {page.title}
          </option>
        ))}
        {/* A page scope naming a tab deleted since: shown as it is, not as another. */}
        {scope.kind === 'page' && !dashboard.pages.some((page) => page.id === scope.pageId) ? (
          <option value={chosen}>Tab: no longer on the dashboard</option>
        ) : null}
        <option value="tiles">Chosen tiles</option>
      </select>
      {scope.kind === 'tiles' ? (
        <fieldset className="filter-bar__tiles">
          <legend>Tiles it applies to</legend>
          {chartTilesOf(dashboard).map((tile) => {
            const name = `${tileName(tile, chartTitleOf)} (${pageTitle(tile.pageId)})`;
            const on = scope.tileIds.includes(tile.tileId);
            return (
              <label key={tile.tileId}>
                <input
                  type="checkbox"
                  aria-label={name}
                  checked={on}
                  onChange={() => {
                    onScope({
                      kind: 'tiles',
                      tileIds: on
                        ? scope.tileIds.filter((id) => id !== tile.tileId)
                        : [...scope.tileIds, tile.tileId],
                    });
                  }}
                />
                {name}
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </>
  );
}
