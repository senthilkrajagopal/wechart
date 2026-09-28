import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DecisionPanel } from './DecisionPanel';
import type { ProposalDetail } from './review';

/**
 * T356 (AC-286, AC-288, AC-290; design 05, states I, J, K and L; rules 77,
 * 78, 85): Approve asks first, naming the folder and where the replaced
 * version goes; Reject takes an optional reason of at most 1,000 characters;
 * the author sees "Approve my own proposal" and "Withdraw…"; a refused
 * approval says why and changes nothing.
 */
const proposal = (over: Partial<ProposalDetail>): ProposalDetail => ({
  id: 'p1',
  kind: 'dashboard',
  itemId: 'd1',
  title: 'Revenue overview',
  targetFolderId: 'f1',
  targetPath: ['Shared', 'Sales', 'EMEA'],
  author: { key: 'wren', name: 'Wren Writer' },
  description: null,
  proposedAt: new Date().toISOString(),
  status: 'open',
  replaces: { id: 'shared-d1', version: 7, copiedFrom: true },
  items: [],
  decision: null,
  mayApprove: true,
  mayReject: true,
  yours: false,
  ...over,
});

function shown(detail: ProposalDetail, answer: { status: number; body: unknown }) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  const onDecided = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DecisionPanel proposal={detail} onDecided={onDecided} />
    </QueryClientProvider>,
  );
  return { fetchMock, onDecided };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deciding a proposal (T356)', () => {
  it('asks before approving, names the folder and where the replaced version goes, and Esc cancels', async () => {
    const { fetchMock, onDecided } = shown(proposal({}), {
      status: 200,
      body: { status: 'approved', landed: [{ kind: 'dashboard', id: 'shared-d1', version: 8 }] },
    });
    const approve = screen.getByRole('button', { name: 'Approve' });
    await userEvent.click(approve);
    const confirm = screen.getByRole('dialog', { name: 'Publish to Sales / EMEA?' });
    expect(confirm.textContent).toContain('Readers see it at once. Version 7 stays in History.');
    expect(document.activeElement).toBe(
      within(confirm).getByRole('button', { name: 'Approve and publish' }),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(approve);
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(approve);
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
    await vi.waitFor(() => {
      expect(onDecided).toHaveBeenCalledWith('Approved. Sales / EMEA now shows version 8.');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proposals/p1/approve',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects with a reason counted to 1,000 characters, never cut', async () => {
    const { fetchMock, onDecided } = shown(proposal({}), {
      status: 200,
      body: { status: 'rejected' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reject…' }));
    const reason = screen.getByLabelText(/Reason/);
    expect(document.activeElement).toBe(reason);
    await userEvent.click(reason);
    await userEvent.paste('a'.repeat(1001));
    expect(screen.getByTestId('reason-counter').textContent).toBe('1,001 / 1,000');
    expect(screen.getByText('Shorten to 1,000 characters.')).toBeTruthy();
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(reason);
    await userEvent.type(reason, 'Keep the median.');
    expect(screen.getByTestId('reason-counter').textContent).toBe('16 / 1,000');
    await userEvent.click(reject);
    await vi.waitFor(() => {
      expect(onDecided).toHaveBeenCalledWith('Rejected. Wren Writer’s workspace keeps the work.');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proposals/p1/reject',
      expect.objectContaining({ body: JSON.stringify({ reason: 'Keep the median.' }) }),
    );
  });

  it('names self-approval for the author, and withdrawing for their reject', async () => {
    shown(proposal({ yours: true }), { status: 200, body: {} });
    expect(
      screen.getByText(
        'You proposed this. Approving your own proposal is allowed and is recorded in the audit trail.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve my own proposal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reject…' })).toBeNull();
  });

  it('offers only what the user may do, and says nothing of approving what they can’t', () => {
    shown(proposal({ yours: true, mayApprove: false }), { status: 200, body: {} });
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Withdraw…' })).toBeTruthy();
    expect(screen.queryByText(/Approving your own proposal/)).toBeNull();
  });

  it('names the version the folder has now as the one kept, where it moved on (T356’s review)', async () => {
    shown(
      proposal({
        items: [
          {
            kind: 'dashboard',
            id: 'd1',
            title: 'Revenue overview',
            version: 3,
            landsIn: 'f1',
            landsInPath: ['Shared', 'Sales', 'EMEA'],
            replaces: { id: 'shared-d1', version: 7, copiedFrom: true },
            replacesNow: 8,
            snapshot: {},
          },
        ],
      }),
      { status: 200, body: {} },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('dialog').textContent).toContain(
      'Readers see it at once. Version 8 stays in History.',
    );
  });

  it('says why an approval was refused, and decides nothing', async () => {
    const { onDecided } = shown(proposal({ replaces: null }), {
      status: 409,
      body: {
        error: '“Revenue overview” changed in its folder since it was proposed. Propose it again.',
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('dialog').textContent).toContain('Readers see it at once.');
    expect(screen.getByRole('dialog').textContent).not.toContain('History');
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Can’t approve: “Revenue overview” changed in its folder since it was proposed. Propose it again.',
    );
    expect(onDecided).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
  });
});
