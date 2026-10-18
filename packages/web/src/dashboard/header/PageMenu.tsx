import { MenuButton } from '../../shell/MenuButton';

/**
 * The pages below 1,024 px (AC-495; design 19 states D2 and D3): a "Page:
 * ‹name› ▾" menu button on a row of its own under the compact row, listing
 * every page in order, the open one checked (`menuitemradio`); choosing
 * another opens it. With one page there is nothing to choose, so nothing.
 */
export function PageMenu({
  pages,
  openId,
  onOpen,
}: {
  readonly pages: readonly { readonly id: string; readonly title: string }[];
  readonly openId: string | undefined;
  readonly onOpen: (pageId: string) => void;
}) {
  if (pages.length < 2) return null;
  const open = pages.find((page) => page.id === openId) ?? pages[0];
  const label = `Page: ${open?.title ?? ''}`;
  return (
    <MenuButton
      label={label}
      className="btn page-menu"
      align="start"
      items={pages.map((page) => ({
        key: page.id,
        label: page.title,
        checked: page.id === open?.id,
        onSelect: () => {
          onOpen(page.id);
        },
      }))}
    >
      {label}
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 6L8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </MenuButton>
  );
}
