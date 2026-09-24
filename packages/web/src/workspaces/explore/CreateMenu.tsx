import { MenuButton } from '../../shell/MenuButton';

/**
 * Creating a folder, dashboard or chart in the open folder (AC-020), through
 * the prototype's one "＋ New ▾" menu (AC-192).
 *
 * The prototype creates at once, under a default name — "Untitled dashboard",
 * "Untitled chart", or "New folder" renamed in the folder's heading — rather
 * than behind a form asking for a name first. A name is easier to choose once
 * the thing exists and is on screen, and a form in the way of every create is
 * a step between the user and what they came to make.
 */
export type CreatableKind = 'folder' | 'dashboard' | 'chart';

export const DEFAULT_TITLES: Record<CreatableKind, string> = {
  dashboard: 'Untitled dashboard',
  chart: 'Untitled chart',
  folder: 'New folder',
};

export interface CreateMenuProps {
  readonly onCreate: (kind: CreatableKind) => void;
  readonly busy?: boolean;
}

/** The prototype's order: what most people came to make, first. */
const OPTIONS: readonly { kind: CreatableKind; label: string; icon: string; chip: string }[] = [
  { kind: 'dashboard', label: 'Dashboard', icon: '▦', chip: 'itemicon ic-dash' },
  { kind: 'chart', label: 'Chart', icon: '◢', chip: 'itemicon ic-chart' },
  { kind: 'folder', label: 'Folder', icon: '▣', chip: 'itemicon ic-folder' },
];

export function CreateMenu({ onCreate, busy = false }: CreateMenuProps) {
  return (
    <MenuButton
      label="New"
      items={OPTIONS.map((option) => ({
        key: option.kind,
        label: (
          <>
            <span className={option.chip} aria-hidden="true">
              {option.icon}
            </span>
            {option.label}
          </>
        ),
        disabled: busy,
        onSelect: () => {
          onCreate(option.kind);
        },
      }))}
    >
      ＋ New ▾
    </MenuButton>
  );
}
