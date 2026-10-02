import { useId } from 'react';

import type { CatalogItem } from './FolderContents';

/**
 * Explore's Show filter (T525, AC-370; design 14, state I): the
 * open folder's items of one kind, its subfolders always listed so they can
 * be opened, the tree as it is. A segmented radio group of native radios:
 * one Tab stop, whose arrows move and choose. The kind is kept in the
 * address (`?kind=`, P2), and All is none.
 */
export type ShownKind = 'all' | 'dashboards' | 'data-sources' | 'models';

const CHOICES: readonly { readonly kind: ShownKind; readonly label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'dashboards', label: 'Dashboards and charts' },
  { kind: 'data-sources', label: 'Data sources' },
  { kind: 'models', label: 'Models' },
];

/** Each kind's items, as the catalog names their kinds. */
const KINDS: Readonly<Record<Exclude<ShownKind, 'all'>, readonly CatalogItem['kind'][]>> = {
  dashboards: ['dashboard', 'chart'],
  'data-sources': ['data-source'],
  models: ['model'],
};

/** The kind the address asks for: All for none, or for one it doesn't know. */
export function kindFrom(asked: unknown): ShownKind {
  return asked === 'dashboards' || asked === 'data-sources' || asked === 'models' ? asked : 'all';
}

/** The subfolders, then only the items of `kind`, in the order listed. */
export function shownOf(items: readonly CatalogItem[], kind: ShownKind): CatalogItem[] {
  if (kind === 'all') return [...items];
  return items.filter((item) => item.kind === 'folder' || KINDS[kind].includes(item.kind));
}

/** Where the folder holds none of the kind: "No data sources in this folder." */
export function emptyTextOf(kind: Exclude<ShownKind, 'all'>): string {
  return {
    dashboards: 'No dashboards or charts in this folder.',
    'data-sources': 'No data sources in this folder.',
    models: 'No models in this folder.',
  }[kind];
}

/** The table's caption, naming the kind shown (design 14, keyboard). */
export function captionOf(kind: ShownKind): string {
  return kind === 'all'
    ? 'Contents of this folder'
    : `Contents of this folder: ${
        { dashboards: 'dashboards and charts', 'data-sources': 'data sources', models: 'models' }[
          kind
        ]
      } only`;
}

/** What is said, politely, once a kind is chosen: "Models: 1, and 2 folders". */
export function sayShown(kind: ShownKind, shown: readonly CatalogItem[]): string {
  const folders = shown.filter((item) => item.kind === 'folder').length;
  const label = CHOICES.find((choice) => choice.kind === kind)!.label;
  return `${label}: ${String(shown.length - folders)}${
    folders === 0 ? '' : `, and ${String(folders)} ${folders === 1 ? 'folder' : 'folders'}`
  }`;
}

export function KindFilter({
  kind,
  onChange,
}: {
  readonly kind: ShownKind;
  readonly onChange: (kind: ShownKind) => void;
}) {
  const name = useId();
  return (
    <div className="kind-filter" role="radiogroup" aria-labelledby={`${name}-label`}>
      <span id={`${name}-label`} className="kind-filter__label">
        Show
      </span>
      <div className="kind-filter__choices">
        {CHOICES.map((choice) => (
          <label
            key={choice.kind}
            className={`kind-filter__choice${choice.kind === kind ? ' is-chosen' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={choice.kind}
              checked={choice.kind === kind}
              onChange={() => {
                onChange(choice.kind);
              }}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
