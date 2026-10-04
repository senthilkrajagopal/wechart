import type { PublicationStore } from '../xcube/publications';

/**
 * The model xcube serves this deployment, and the revision last recorded
 * for it, read as each request is signed (T421, AC-334): an answer comes
 * from that revision or a newer one, whichever replica recorded it. The
 * server's own client and wechart's scheduler (T378) both name it, so a
 * scheduled run builds the folder's rollups in the model xcube serves, not
 * Cube's disk model (research `xcube-slice-2.md`).
 *
 * The last revision read stands while the record can't be read: reading it
 * is never what breaks a chart (T421's review).
 */
export function deploymentModel(
  id: string | undefined,
  publications: PublicationStore | undefined,
  warn: (error: unknown) => void,
): { readonly id: string; readonly revision: () => Promise<number | undefined> } | undefined {
  if (id === undefined || publications === undefined) return undefined;
  let lastRevision: number | undefined;
  return {
    id,
    revision: async () => {
      try {
        lastRevision = (await publications.get(id))?.revision;
      } catch (error) {
        warn(error);
      }
      return lastRevision;
    },
  };
}
