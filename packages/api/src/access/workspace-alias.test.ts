import { describe, expect, it } from 'vitest';

import { aliasIn, aliasOut } from './workspace-alias';

/**
 * T343 (AC-276), from its review: the client names My workspace `mine`, and
 * a signed-in user's is their own `ws:<key>`. The API takes `mine` for it in
 * every `folderId` a request carries, at any depth — a document's body, a
 * dashboard's charts — and names it `mine` in every answer, so the client
 * never sees the stored id.
 */
const OWN = 'ws:CiQ4MjBlZmRlOC0xMjM0EgVsb2NhbA';

describe('My workspace, named `mine` both ways (T343)', () => {
  it('takes `mine` for the user’s own in every folderId, at any depth', () => {
    const body = {
      folderId: 'mine',
      dashboard: { body: { folderId: 'mine', title: 'mine' } },
      charts: [{ body: { folderId: 'mine' } }, { body: { folderId: 'root' } }],
      note: 'mine',
    };

    aliasIn(body, OWN);

    expect(body).toEqual({
      folderId: OWN,
      dashboard: { body: { folderId: OWN, title: 'mine' } },
      charts: [{ body: { folderId: OWN } }, { body: { folderId: 'root' } }],
      note: 'mine',
    });
  });

  it('names it `mine` in an answer, and no one else’s', () => {
    const answer = JSON.stringify({
      id: 'd1',
      folderId: OWN,
      parentId: OWN,
      rows: [{ folderId: OWN }, { folderId: 'ws:someone-else' }, { folderId: 'root' }],
      title: `${OWN} in a title`,
    });

    expect(JSON.parse(aliasOut(answer, OWN))).toEqual({
      id: 'd1',
      folderId: 'mine',
      parentId: 'mine',
      rows: [{ folderId: 'mine' }, { folderId: 'ws:someone-else' }, { folderId: 'root' }],
      title: `${OWN} in a title`,
    });
  });
});
