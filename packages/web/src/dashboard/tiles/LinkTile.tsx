import type { SearchFilter } from '../../filters/url';
import type { Tile } from '../model/document';

/**
 * Why a web address cannot be a link tile's target, or undefined when it can
 * (AC-064, direction.md rule 42: "A Link/button accepts only dashboard targets
 * or http(s) URLs"). Only an absolute http or https address: `javascript:`,
 * `data:`, `file:` and the rest could run script or reach the reader's own
 * machine, and a relative one would resolve against wechart itself.
 */
export function webAddressProblem(address: string): string | undefined {
  const trimmed = address.trim();
  if (trimmed === '') return 'Enter a web address.';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Only http and https addresses can be linked to.';
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    ? undefined
    : 'Only http and https addresses can be linked to.';
}

/**
 * Where a link tile goes: a dashboard's address — carrying the current filter
 * values in its `filters` parameter when told to (AC-081's form, which the
 * target adopts onto its own filters on the same fields) — or a web address.
 * Nothing for no target, or for an address that is not http(s), however it
 * came to be in the document.
 */
function hrefOf(tile: Tile, carried: readonly SearchFilter[] | undefined): string | undefined {
  /**
   * Read as untrusted: a body saved through the API, or an older one, can
   * hold a target of any shape, and one that throws here fails the whole
   * dashboard rather than one tile (T070's review). Anything unexpected is
   * no link.
   */
  const target = tile.link?.target as unknown;
  if (typeof target !== 'object' || target === null) return undefined;
  const { kind, url, dashboardId, passFilters } = target as Record<string, unknown>;
  if (kind === 'url') {
    if (typeof url !== 'string' || webAddressProblem(url) !== undefined) return undefined;
    // The address as parsed, not as typed: "http:evil.com" is accepted as
    // http://evil.com/, but as an href it resolves against wechart's page.
    return new URL(url.trim()).href;
  }
  if (kind !== 'dashboard' || typeof dashboardId !== 'string') return undefined;
  const path = `/explore/dashboards/${encodeURIComponent(dashboardId)}`;
  if (passFilters !== true || carried === undefined || carried.length === 0) return path;
  return `${path}?filters=${encodeURIComponent(JSON.stringify(carried))}`;
}

/**
 * A link tile (AC-064): a label, drawn as a button, a primary button or a
 * text link, that opens another dashboard or a web address. A web address
 * opens in a new tab, and the page it opens learns nothing of this one
 * (`noopener noreferrer`). While the dashboard is being edited it goes
 * nowhere: clicking selects the tile.
 */
export function LinkTile({
  tile,
  editing,
  carried,
}: {
  tile: Tile;
  editing: boolean;
  /** The filter values in effect, as a dashboard's URL carries them. */
  carried?: readonly SearchFilter[] | undefined;
}) {
  const label = tile.text?.trim() === '' || tile.text === undefined ? 'Link' : tile.text;
  const className = `link-tile link-tile--${tile.link?.style ?? 'button'}`;
  const href = editing ? undefined : hrefOf(tile, carried);
  if (href === undefined) return <span className={className}>{label}</span>;
  return tile.link?.target?.kind === 'url' ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ) : (
    <a className={className} href={href}>
      {label}
    </a>
  );
}
