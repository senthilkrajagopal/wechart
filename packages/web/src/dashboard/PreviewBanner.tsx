import { QueryClientContext } from '@tanstack/react-query';
import { Fragment, useContext } from 'react';

import type { Me } from '../shell/AccountMenu';
import { AccessIcon } from '../workspaces/explore/AccessChip';
import { ME_QUERY } from '../shell/me';
import { StatusIcon } from '../shell/StatusIcon';

/**
 * "a", "a and b", "a, b and c", each name in the code face and bold, as
 * design 08 sets them, so a group named "Sales and Marketing" never reads as
 * two (T438's review).
 */
function Listed({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((name, at) => (
        <Fragment key={name}>
          {at === 0 ? '' : at === names.length - 1 ? ' and ' : ', '}
          <b>
            <code>{name}</code>
          </b>
        </Fragment>
      ))}
    </>
  );
}

/** The groups a context names, when it names nothing else: a preview as groups (T438). */
function groupsOnly(context: Readonly<Record<string, unknown>>): readonly string[] | undefined {
  const keys = Object.keys(context);
  const groups = context['groups'];
  return keys.length === 1 &&
    Array.isArray(groups) &&
    groups.every((group) => typeof group === 'string')
    ? (groups as string[])
    : undefined;
}

/**
 * The persistent banner over a dashboard previewed as a security context
 * (T172, AC-166; direction.md rule 21, "a persistent banner shows it is
 * active"): the context in effect, word for word, and the way out. It stays
 * pinned while the page scrolls, and is gone only when the preview is.
 *
 * With sign-in on, a preview is as groups (T438; design 08, state E, as
 * drawn since T630): the eye, "Previewing as sales-ro and emea-viewers ·
 * Revenue overview", and Stop preview as a button, on the accent. Sign-in
 * off keeps phase 1's bar and context, word for word.
 */
export function PreviewBanner({
  context,
  onExit,
  title,
}: {
  context: Readonly<Record<string, unknown>>;
  onExit: (() => void) | undefined;
  /** The dashboard previewed, named after the groups (design 08, state E). */
  title?: string | undefined;
}) {
  // Who is signed in, as the sign-in gate left it; none outside a client.
  const client = useContext(QueryClientContext);
  const me = client?.getQueryData<Me>(ME_QUERY.queryKey);
  const groups = me?.security === 'oidc' ? groupsOnly(context) : undefined;
  // The same address without the preview: a link, so it can be opened and
  // read as one.
  const exit = new URL(window.location.href);
  exit.searchParams.delete('preview');
  return (
    <div
      className={groups === undefined ? 'preview-banner' : 'preview-banner preview-banner--groups'}
      role="status"
      data-testid="preview-banner"
    >
      {/* A mode to notice, with its icon (direction.md rule 3): design 08's eye. */}
      {groups === undefined ? <StatusIcon kind="warn" /> : <AccessIcon name="eye" />}
      {groups === undefined ? (
        <span>
          Previewing as <code>{JSON.stringify(context)}</code>. This dashboard&rsquo;s queries run
          with this security context.
        </span>
      ) : (
        <span className="preview-banner__said">
          Previewing as {groups.length === 0 ? 'no groups' : <Listed names={groups} />}
          {title === undefined ? '' : ` · ${title}`}
        </span>
      )}
      {/* A link, so it can be opened as one; drawn as design 08's button. */}
      <a
        href={`${exit.pathname}${exit.search}`}
        className={groups === undefined ? undefined : 'btn btn-sm'}
        onClick={(event) => {
          if (onExit === undefined) return;
          event.preventDefault();
          onExit();
        }}
      >
        {groups === undefined ? 'Exit preview' : 'Stop preview'}
      </a>
    </div>
  );
}
