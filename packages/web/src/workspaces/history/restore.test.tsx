import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RestoreDialogs, useRestore, type RestoringVersion } from './restore';

/**
 * T357 (AC-289; design 06, state C; T354's review): restoring asks before
 * the user's own copy is replaced, says why when it can't, and otherwise
 * hands the draft to the Propose dialog, titled for the version.
 */
const version: RestoringVersion = {
  version: 7,
  at: new Date(2026, 8, 22, 10, 14).toISOString(),
  title: 'Revenue overview',
  author: { key: 'ada', name: 'Ada Admin' },
  approver: { key: 'ada', name: 'Ada Admin' },
  description: null,
  current: false,
  approvedText: 'approved 22 Sep by Ada Admin',
};

function Harness() {
  const restore = useRestore('dashboard', 'd1');
  return (
    <>
      <button
        type="button"
        onClick={() => {
          restore.start(version);
        }}
      >
        Restore 7
      </button>
      <RestoreDialogs kind="dashboard" restore={restore} onProposed={vi.fn()} />
    </>
  );
}

const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function shown(restoreAnswers: { status: number; body: unknown }[]) {
  const asked: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/history/dashboard/d1/restore') {
        asked.push(JSON.parse(String(init?.body)));
        const next = restoreAnswers.shift()!;
        return answer(next.status, next.body);
      }
      if (url === '/api/proposals/check')
        return answer(200, {
          targetPath: ['Shared', 'Sales', 'EMEA'],
          items: [
            {
              kind: 'dashboard',
              id: 'draft',
              title: 'Revenue overview',
              landsInPath: ['Shared', 'Sales', 'EMEA'],
              replaces: { id: 'd1', version: 8, copiedFrom: true },
            },
          ],
        });
      return answer(404, {});
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );
  return { asked };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('restoring a version (T357)', () => {
  it('asks before replacing the user’s copy, then proposes the draft, titled for the version', async () => {
    const { asked } = shown([
      {
        status: 409,
        body: {
          error:
            'You have a copy of it in your workspace. Restoring this version replaces what that copy holds.',
          id: 'copy',
          replaceable: true,
        },
      },
      { status: 201, body: { kind: 'dashboard', id: 'draft' } },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Restore 7' }));
    const ask = await screen.findByRole('dialog', { name: 'Replace your copy?' });
    // Focus to it as it opens (rule 85).
    expect(document.activeElement).toBe(
      within(ask).getByRole('button', { name: 'Replace my copy' }),
    );
    await userEvent.click(within(ask).getByRole('button', { name: 'Replace my copy' }));
    const propose = await screen.findByRole('dialog', {
      name: 'Propose restoring version 7 to Sales / EMEA',
    });
    expect((within(propose).getByLabelText(/What changed/) as HTMLTextAreaElement).value).toBe(
      'Restore version 7 (approved 22 Sep by Ada Admin).',
    );
    expect(asked).toEqual([{ version: 7 }, { version: 7, replaceCopy: true }]);
  });

  it('says why when it can’t, and offers nothing to go on with', async () => {
    shown([
      {
        status: 409,
        body: {
          error:
            'That version shows a chart you can’t open, so it can’t be restored into your workspace.',
        },
      },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Restore 7' }));
    const said = await screen.findByRole('dialog', { name: 'Can’t restore version 7' });
    expect(said.textContent).toContain('shows a chart you can’t open');
    expect(within(said).queryByRole('button', { name: 'Replace my copy' })).toBeNull();
    // Esc closes it (rule 85).
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('restoring a data source’s version (T515; design 06, state D)', () => {
  function SourceHarness({ onDrafted }: { onDrafted: (id: string, version: number) => void }) {
    const restore = useRestore('data-source', 's1');
    return (
      <>
        <button
          type="button"
          onClick={() => {
            restore.start(version);
          }}
        >
          Restore 7
        </button>
        <RestoreDialogs
          kind="data-source"
          restore={restore}
          onProposed={vi.fn()}
          onDrafted={onDrafted}
        />
      </>
    );
  }

  it('drafts it in the workspace and opens the draft to be tested, never the Propose dialog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/history/data-source/s1/restore'
          ? answer(201, { kind: 'data-source', id: 'draft-source' })
          : answer(404, {}),
      ),
    );
    const onDrafted = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SourceHarness onDrafted={onDrafted} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Restore 7' }));
    await vi.waitFor(() => {
      expect(onDrafted).toHaveBeenCalledWith('draft-source', 7);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
