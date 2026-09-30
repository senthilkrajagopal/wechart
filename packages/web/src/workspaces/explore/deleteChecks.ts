import type { Checked, Refusal } from './DeleteDialog';
import { SHARED_ROOT } from './roots';

/**
 * What the server says depends on an item, turned into design 14's dialogs
 * (T517; states A–E): asked before the dialog chooses between Can't delete
 * and the confirmation, and answered again, the same way, by the delete's
 * own `409`.
 */
type Step = { readonly id: string; readonly title: string };

/** A folder's path from Shared, as the dialogs name it: "Sales / EMEA", or "Shared". */
export const pathText = (path: readonly Step[]): string =>
  path.length === 0 ? SHARED_ROOT.title : path.map((step) => step.title).join(' / ');

/** The server's reason, or the status, for an answer that is neither done nor refused. */
async function failure(response: Response, what: string): Promise<Error> {
  const said = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  return new Error(said.error ?? said.message ?? `${what} (${String(response.status)}).`);
}

/** A library chart's dependents (T517, AC-362): the shared folders' dashboards that show it. */
export interface ChartDependents {
  readonly dashboards: readonly {
    readonly id: string;
    readonly title: string;
    readonly folderId: string | null;
    readonly folderPath: readonly Step[];
  }[];
  /** Those in folders the user can't see: counted, never named (AC-322). */
  readonly hidden: number;
}

const dashboards = (count: number) => `${String(count)} dashboard${count === 1 ? '' : 's'}`;

/**
 * Design 14's state A: what uses the chart, and what to do. The line on
 * proposals is left out with sign-in off, where dashboards change in place.
 */
export function chartRefusal(
  found: ChartDependents,
  { signedIn, justNow = false }: { readonly signedIn: boolean; readonly justNow?: boolean },
): Refusal | undefined {
  const total = found.dashboards.length + found.hidden;
  if (total === 0) return undefined;
  if (found.dashboards.length === 0 && !justNow)
    return {
      kind: 'refused',
      lead: `${dashboards(total)} ${total === 1 ? 'uses' : 'use'} it, in folders you can’t see. It can be deleted once no dashboard uses it.`,
    };
  return {
    kind: 'refused',
    lead: justNow
      ? total === 1
        ? 'A dashboard started using it just now. Nothing was deleted.'
        : `${dashboards(total)} use it now. Nothing was deleted.`
      : total === 1
        ? '1 dashboard uses it. Remove it from the dashboard, then delete it.'
        : `${dashboards(total)} use it. Remove it from each of them, then delete it.`,
    ...(found.dashboards.length === 0
      ? {}
      : {
          groups: [
            {
              heading: 'Dashboards that use it',
              rows: found.dashboards.map((dashboard) => ({
                key: dashboard.id,
                icon: 'dashboard' as const,
                name: dashboard.title,
                href: `/explore/dashboards/${encodeURIComponent(dashboard.id)}`,
                where: pathText(dashboard.folderPath),
              })),
            },
          ],
        }),
    ...(found.hidden === 0 ? {} : { hidden: found.hidden }),
    ...(signedIn && found.dashboards.length > 0
      ? { help: 'A shared dashboard changes through Edit in my workspace and a proposal.' }
      : {}),
  };
}

/** Asks what uses a library chart, for its dialog (state A1). */
export const checkChart = (id: string, signedIn: boolean) => async (): Promise<Checked> => {
  const response = await fetch(`/api/documents/chart/${encodeURIComponent(id)}/dependents`);
  if (!response.ok) throw await failure(response, 'What uses it couldn’t be read');
  const found = (await response.json()) as ChartDependents;
  return chartRefusal(found, { signedIn }) ?? { kind: 'confirm', text: 'No dashboard uses it.' };
};

/** Deletes a library chart: its refusal, where a dashboard took it up meanwhile (state A4). */
export const removeChart =
  (id: string, signedIn: boolean) => async (): Promise<Refusal | undefined> => {
    const response = await fetch(`/api/documents/chart/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 409) {
      const said = (await response.json().catch(() => ({}))) as Partial<ChartDependents> & {
        error?: string;
      };
      if (Array.isArray(said.dashboards))
        return chartRefusal(
          { dashboards: said.dashboards, hidden: said.hidden ?? 0 },
          { signedIn, justNow: true },
        );
      throw new Error(said.error ?? 'It could not be deleted.');
    }
    if (!response.ok) throw await failure(response, 'It could not be deleted');
    return undefined;
  };
