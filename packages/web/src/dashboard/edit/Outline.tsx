import { firstReadingOf } from '../../tiles/Markdown';
import { firstReadingOfDocument, isEmptyTextDocument } from '../../tiles/text/documents';
import { KIND_ICON } from './kindIcon';
import { elementAt, placeOf, type DashboardDocument, type Element_ } from '../model/document';

/**
 * The edit sidebar's Outline (AC-053): the dashboard as a tree, the way the
 * prototype's `outline()` draws it — each page tab, then its elements, with a
 * section's elements and a tab group's tabs nested beneath them.
 *
 * A row selects its element, which is the point of an outline on a canvas
 * that scrolls: the element may be far below, on a page tab that is not open,
 * or in a tab of a tab group that is not showing.
 *
 * **Nested lists of buttons, not an ARIA tree.** `role="tree"` promises the
 * tree pattern — focus on the items, arrow keys, expand and collapse — and a
 * tree that answers only Tab and Enter breaks that promise for exactly the
 * people who rely on it (T209's review). Nested lists announce their depth
 * ("list, level 2") without promising anything, and every row is a button
 * reached by Tab and pressed with Enter or Space. The selected row says so
 * with `aria-current`.
 */
export interface OutlineProps {
  readonly document: DashboardDocument;
  readonly selected: string | null;
  /** Select an element, opening the page tab it is on. */
  readonly onSelect: (pageId: string, elementId: string) => void;
  /** A chart tile's title, from its chart; the tile holds only the chart's id. */
  readonly chartTitleOf: (chartId: string) => string | undefined;
}

const KIND_LABEL: Record<string, string> = {
  chart: 'Chart',
  text: 'Text',
  markdown: 'Markdown',
  header: 'Header',
  divider: 'Divider',
  image: 'Image',
  link: 'Link',
  filter: 'Filter',
  section: 'Section',
  tabs: 'Tab group',
};

/** How a row names an element: its kind, then what the reader knows it by. */
export function outlineNameOf(
  element: Element_,
  chartTitleOf: OutlineProps['chartTitleOf'],
): string {
  const kind = KIND_LABEL[element.kind] ?? element.kind;
  if (element.kind === 'text') {
    // By its first line; "Empty text" only for a tile holding nothing at
    // all (design 21 G6), so one drawing only a value is "Text" (T874's
    // review).
    const read = firstReadingOfDocument(element.document);
    if (read !== '') return `${kind}: ${read.length > 40 ? `${read.slice(0, 40)}…` : read}`;
    return isEmptyTextDocument(element.document) ? 'Empty text' : kind;
  }
  if (element.kind === 'tabs') return `${kind}: ${element.tabs.map((tab) => tab.title).join(', ')}`;
  const own =
    element.kind === 'section'
      ? element.title
      : element.kind === 'chart' && element.chartId !== undefined
        ? chartTitleOf(element.chartId)
        : element.kind === 'image'
          ? element.alt
          : element.kind === 'markdown'
            ? // Its first line as the tile reads it, by the rules that draw it
              // (T247, recheck-dashboard N9; its review).
              firstReadingOf(element.text ?? '')
            : element.text;
  const trimmed = own?.trim() ?? '';
  if (trimmed === '') return kind;
  // A long markdown paragraph is not a name; its opening words are enough.
  return `${kind}: ${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}`;
}

/**
 * How a tile is named wherever it is announced — its accessible name, its
 * menus, a drag (AC-209): as the Outline names it, and for a tile with nothing
 * of its own to go by, its kind and its place among its neighbours. Never its
 * id.
 */
export function tileNameOf(
  document: DashboardDocument,
  id: string,
  chartTitleOf: OutlineProps['chartTitleOf'],
): string {
  const element = elementAt(document, id);
  if (element === null) return 'Tile';
  const name = outlineNameOf(element, chartTitleOf);
  if (name.includes(':')) return name;
  const place = placeOf(document, id);
  return place === null ? name : `${name} ${String(place.index + 1)} of ${String(place.of)}`;
}

export function Outline({ document, selected, onSelect, chartTitleOf }: OutlineProps) {
  const rows = (items: readonly Element_[], pageId: string, depth: number) =>
    items.length === 0 ? null : (
      <ul>
        {items.map((element) => {
          const name = outlineNameOf(element, chartTitleOf);
          return (
            <li key={element.id}>
              <button
                type="button"
                className="outline__row"
                aria-current={selected === element.id ? 'true' : undefined}
                style={{ paddingLeft: 12 + depth * 14 }}
                onClick={() => onSelect(pageId, element.id)}
              >
                <span className="outline__icon" aria-hidden="true">
                  {KIND_ICON[element.kind] ?? '•'}
                </span>
                {name}
              </button>
              {element.kind === 'section' ? rows(element.items, pageId, depth + 1) : null}
              {element.kind === 'tabs' ? (
                <ul>
                  {element.tabs.map((tab) => (
                    <li key={tab.id}>
                      <span className="outline__tab" style={{ paddingLeft: 26 + depth * 14 }}>
                        Tab: {tab.title}
                      </span>
                      {rows(tab.items, pageId, depth + 2) ?? (
                        <span className="outline__empty" style={{ paddingLeft: 40 + depth * 14 }}>
                          Empty
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

  return (
    <nav className="outline" aria-label="Dashboard outline">
      <ul>
        {document.pages.map((page) => (
          <li key={page.id}>
            <span className="outline__page">Page: {page.title}</span>
            {rows(page.items, page.id, 1) ?? <span className="outline__empty">Empty</span>}
          </li>
        ))}
      </ul>
    </nav>
  );
}
