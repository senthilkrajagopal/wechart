/**
 * The contents of the selected folder (AC-017): sub-folders, dashboards and
 * library charts, each with its type, owner and last-updated time.
 *
 * A real `<table>`, so the column a value belongs to is carried by the markup
 * rather than by position alone (AC-176, AC-178).
 */
export interface CatalogItem {
  readonly kind: 'folder' | 'dashboard' | 'chart';
  readonly id: string;
  readonly title: string;
  readonly owner: string | null;
  readonly updatedAt: string;
}

export interface FolderContentsProps {
  readonly items: readonly CatalogItem[];
  readonly onOpen?: (item: CatalogItem) => void;
}

const TYPE_LABEL: Record<CatalogItem['kind'], string> = {
  folder: 'Folder',
  dashboard: 'Dashboard',
  chart: 'Chart',
};

const TYPE_ICON: Record<CatalogItem['kind'], string> = {
  folder: '🗀',
  dashboard: '▤',
  chart: '▦',
};

export function FolderContents({ items, onOpen }: FolderContentsProps) {
  if (items.length === 0) {
    return <p className="folder-contents__empty">This folder is empty.</p>;
  }

  return (
    <table className="folder-contents">
      <caption className="visually-hidden">Contents of this folder</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Owner</th>
          <th scope="col">Last updated</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={`${item.kind}:${item.id}`} data-testid={`item-${item.id}`}>
            <th scope="row">
              <button type="button" className="link-button" onClick={() => onOpen?.(item)}>
                {item.title}
              </button>
            </th>
            <td>
              {/* Type is an icon and a label, never the icon alone. */}
              <span data-icon={item.kind} aria-hidden="true">
                {TYPE_ICON[item.kind]}
              </span>{' '}
              {TYPE_LABEL[item.kind]}
            </td>
            <td>{item.owner ?? '—'}</td>
            <td>
              <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString()}</time>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
