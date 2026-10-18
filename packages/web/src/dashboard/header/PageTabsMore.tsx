import { MenuButton } from '../../shell/MenuButton';

/**
 * "More ▾" after the inline page tabs in view mode (AC-492; 19-Q5 (a);
 * design 19 pin 3 and state D1): a menu button listing, in order, the pages
 * that don't fit the compact row. Choosing one opens it; the open page is
 * never here, since it is always inline (`tabsThatFit`).
 *
 * Named "More pages", which holds its visible "More" (WCAG 2.5.3), so it
 * isn't taken for the actions' ⋯, named "More".
 */
export function PageTabsMore({
  pages,
  onOpen,
}: {
  readonly pages: readonly { readonly id: string; readonly title: string }[];
  readonly onOpen: (pageId: string) => void;
}) {
  return (
    <MenuButton
      label="More pages"
      className="page-tabs__more"
      align="start"
      items={pages.map((page) => ({
        key: page.id,
        label: page.title,
        onSelect: () => {
          onOpen(page.id);
        },
      }))}
    >
      More
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 6L8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </MenuButton>
  );
}
