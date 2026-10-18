import type { ReactNode } from 'react';

import { textLinkProblem } from '@wechart/core';

/**
 * A Text tile's link in view mode (T873, AC-513, rule 42).
 *
 * Tiptap's JSON static renderer runs no `renderHTML`, so the Link mark's own
 * href check never applies here (research `rich-tiles-and-combo-tech.md`,
 * Gotchas: "Read-mode links are ours to check"). This is that check, the one
 * the API saves by: an http(s) address with a host, or a wechart dashboard.
 * Anything else — `javascript:`, `data:`, a protocol-relative `//host`, a
 * value that isn't text — is its words as plain text, with no `href` at all.
 *
 * An outside address opens in a new tab, cut off from this one; a dashboard
 * opens in place, as the Link/button tile's does (AC-064).
 */
export function SafeLink({
  mark,
  children,
}: {
  readonly mark: {
    readonly type?: unknown;
    readonly attrs?: Readonly<Record<string, unknown>> | undefined;
  };
  readonly children?: ReactNode;
}) {
  const href = mark.attrs?.['href'];
  if (typeof href !== 'string' || textLinkProblem(href) !== undefined) return <>{children}</>;
  if (href.startsWith('/')) return <a href={href}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
