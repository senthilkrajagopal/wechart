import { MenuButton, type MenuItem } from '../../shell/MenuButton';

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
  /**
   * The kinds it makes here, by the user's role (T331, AC-192): a shared
   * folder's read-write members Folder alone, the workspace every kind, a
   * reader none. Every kind when left out, as phase 1 made them anywhere.
   * With nothing to offer, there is no New at all.
   */
  readonly offers?: readonly CreatableKind[];
  readonly onCreate: (kind: CreatableKind) => void;
  /**
   * A data source, offered in My workspace (AC-192, AC-158; T363): through
   * its wizard, since it can't exist before its connection does.
   */
  readonly onNewSource?: () => void;
  /**
   * A model, offered in My workspace (T347; AC-192, AC-282): a new cube, which
   * asks for its name and the folder it is to go to.
   */
  readonly onNewModel?: () => void;
  /**
   * Importing a dashboard from an export file, offered in My workspace where
   * it lands (T513, AC-192, AC-356; design 13, state G): under a divider,
   * after the kinds, so creating stays what New is.
   */
  readonly onImport?: () => void;
  readonly busy?: boolean;
  /**
   * The menu's head, in My workspace (design 13, state G; T692): "New in My
   * workspace", Folder then set apart under a divider as the one kind with
   * no target.
   */
  readonly heading?: string;
}

/** The prototype's order: what most people came to make, first. */
const OPTIONS: readonly { kind: CreatableKind; label: string; icon: string; chip: string }[] = [
  { kind: 'dashboard', label: 'Dashboard', icon: '▦', chip: 'itemicon ic-dash' },
  { kind: 'chart', label: 'Chart', icon: '◢', chip: 'itemicon ic-chart' },
  { kind: 'folder', label: 'Folder', icon: '▣', chip: 'itemicon ic-folder' },
];

export function CreateMenu({
  offers,
  onCreate,
  onNewSource,
  onNewModel,
  onImport,
  busy = false,
  heading,
}: CreateMenuProps) {
  const items: MenuItem[] = OPTIONS.filter(
    (option) => offers === undefined || offers.includes(option.kind),
  ).map((option) => {
    // In the workspace, the one kind made at once, with no target (state G).
    const noTarget = heading !== undefined && option.kind === 'folder';
    return {
      key: option.kind as string,
      label: (
        <>
          <span className={option.chip} aria-hidden="true">
            {option.icon}
          </span>
          {option.label}
          {noTarget ? <span className="menu-button__aside">no target</span> : null}
        </>
      ),
      ...(noTarget ? { separatorBefore: true } : {}),
      disabled: busy,
      onSelect: () => {
        onCreate(option.kind);
      },
    };
  });
  if (onNewModel !== undefined)
    // AC-192's order in the workspace: Dashboard, Chart, Model, Data source, Folder.
    items.splice(items.length - 1, 0, {
      key: 'model',
      label: (
        <>
          <span className="itemicon ic-model" aria-hidden="true">
            ◇
          </span>
          Model
        </>
      ),
      disabled: busy,
      onSelect: onNewModel,
    });
  if (onNewSource !== undefined)
    // AC-192's order in the workspace: Dashboard, Chart, Model, Data source, Folder.
    items.splice(items.length - 1, 0, {
      key: 'data-source',
      label: (
        <>
          <span className="itemicon ic-source" aria-hidden="true">
            ◍
          </span>
          Data source
        </>
      ),
      disabled: busy,
      onSelect: onNewSource,
    });
  if (onImport !== undefined)
    items.push({
      key: 'import-file',
      label: (
        <>
          <span className="itemicon ic-upload" aria-hidden="true">
            ⤒
          </span>
          Import a dashboard…
          <span className="menu-button__aside">from a file</span>
        </>
      ),
      separatorBefore: true,
      disabled: busy,
      onSelect: onImport,
    });
  // Nothing the user may make here: no New, rather than an empty menu (rule 68).
  if (items.length === 0) return null;
  return (
    <MenuButton
      label="New"
      items={items}
      testId="explore-new"
      // Design 13's 250 px, Import and its aside on one line (T693, EXP-07).
      menuWidth={250}
      {...(heading === undefined ? {} : { heading })}
    >
      ＋ New ▾
    </MenuButton>
  );
}
