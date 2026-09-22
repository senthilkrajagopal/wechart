import { StatusIcon } from '../shell/StatusIcon';

/**
 * The persistent banner over a dashboard previewed as a security context
 * (T172, AC-166; direction.md rule 21, "a persistent banner shows it is
 * active"): the context in effect, word for word, and the way out. It stays
 * pinned while the page scrolls, and is gone only when the preview is.
 */
export function PreviewBanner({
  context,
  onExit,
}: {
  context: Readonly<Record<string, unknown>>;
  onExit: (() => void) | undefined;
}) {
  // The same address without the preview: a link, so it can be opened and
  // read as one.
  const exit = new URL(window.location.href);
  exit.searchParams.delete('preview');
  return (
    <div className="preview-banner" role="status" data-testid="preview-banner">
      {/* A mode to notice, with its icon (direction.md rule 3). */}
      <StatusIcon kind="warn" />
      <span>
        Previewing as <code>{JSON.stringify(context)}</code>. This dashboard&rsquo;s queries run
        with this security context.
      </span>
      <a
        href={`${exit.pathname}${exit.search}`}
        onClick={(event) => {
          if (onExit === undefined) return;
          event.preventDefault();
          onExit();
        }}
      >
        Exit preview
      </a>
    </div>
  );
}
