import { useRef, useState, type ReactNode } from 'react';

/**
 * The docked edit sidebar (AC-053, direction.md section 2): Add, Outline and
 * Properties.
 *
 * The panels take their content from whoever renders the sidebar. The element
 * palette arrives at T064, the outline tree and the properties inspector
 * later; an empty panel here is a panel with nothing in it yet, not a panel
 * with invented copy in it.
 */
export const SIDEBAR_PANELS = ['Add', 'Outline', 'Properties'] as const;

export type SidebarPanel = (typeof SIDEBAR_PANELS)[number];

export interface SidebarContent {
  readonly add?: ReactNode;
  readonly outline?: ReactNode;
  readonly properties?: ReactNode;
}

export interface EditSidebarProps {
  readonly panels?: SidebarContent | undefined;
}

const CONTENT_KEY: Record<SidebarPanel, keyof SidebarContent> = {
  Add: 'add',
  Outline: 'outline',
  Properties: 'properties',
};

const tabId = (panel: SidebarPanel) => `edit-sidebar-tab-${panel.toLowerCase()}`;

export function EditSidebar({ panels }: EditSidebarProps) {
  const [open, setOpen] = useState<SidebarPanel>('Add');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * The APG tabs pattern: one tab stop for the list, arrows to move within it,
   * and moving focus selects. Rule 39 asks that every edit-mode action work
   * without a mouse, and a sidebar whose panels can only be reached by
   * clicking would be the first place that fails.
   */
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    const next = (index + step + SIDEBAR_PANELS.length) % SIDEBAR_PANELS.length;
    const panel = SIDEBAR_PANELS[next];
    if (panel === undefined) return;

    setOpen(panel);
    tabs.current[next]?.focus();
  };

  return (
    <aside aria-label="Edit sidebar" className="edit-sidebar">
      <div role="tablist" aria-label="Edit sidebar panels" className="edit-sidebar__tabs">
        {SIDEBAR_PANELS.map((panel, index) => (
          <button
            key={panel}
            type="button"
            role="tab"
            id={tabId(panel)}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            aria-selected={panel === open}
            tabIndex={panel === open ? 0 : -1}
            onClick={() => setOpen(panel)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {panel}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={tabId(open)}
        tabIndex={0}
        className="edit-sidebar__panel"
        data-testid="sidebar-scroll"
      >
        {panels?.[CONTENT_KEY[open]]}
      </div>
    </aside>
  );
}
