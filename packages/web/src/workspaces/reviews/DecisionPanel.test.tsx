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

  /**
   * T405's follow-up (AC-176; rule 85): Esc closes Reject's step from
   * anywhere in it, back on Reject…, asking first when a reason was typed.
   */
  it('closes Reject’s step on Esc from anywhere in it, asking first over a typed reason', async () => {
    const { fetchMock } = shown(proposal({}), { status: 200, body: { status: 'rejected' } });
    const opener = screen.getByRole('button', { name: 'Reject…' });
    await userEvent.click(opener);
    // From its Cancel, nothing typed: closed at once.
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText(/Reason/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reject…' }));

    // A reason typed: Esc from its Reject button asks first.
    await userEvent.click(screen.getByRole('button', { name: 'Reject…' }));
    await userEvent.type(screen.getByLabelText(/Reason/), 'Keep the median.');
    screen.getByRole('button', { name: 'Reject' }).focus();
    await userEvent.keyboard('{Escape}');
    const question = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(document.activeElement).toBe(
      within(question).getByRole('button', { name: 'Keep editing' }),
    );
    // Esc over the question keeps editing, the reason kept.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Keep the median.');
    expect(document.activeElement).toBe(screen.getByLabelText(/Reason/));
    // Cancel asks too; discarded, the step closes, back on Reject…, nothing sent.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText(/Reason/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reject…' }));
    expect(fetchMock).not.toHaveBeenCalled();
    // Opened again, the discarded reason is gone.
    await userEvent.click(screen.getByRole('button', { name: 'Reject…' }));
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('');
  });

  // T405's review: a question asked while the reject is on its way goes with its step.
  it('lets the question go once the reject it was asked over is done', async () => {
    let answer: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DecisionPanel proposal={proposal({})} onDecided={vi.fn()} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reject…' }));
    await userEvent.type(screen.getByLabelText(/Reason/), 'Keep the median.');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.keyboard('{Escape}');
    expect(
      screen.getByRole('alertdialog', { name: 'Discard your changes?' }).textContent,
    ).toContain('The reason you typed isn’t kept.');
    answer(new Response(JSON.stringify({ status: 'rejected' }), { status: 200 }));
    await vi.waitFor(() => {
      expect(screen.queryByLabelText(/Reason/)).toBeNull();
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
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

  // T723 (AC-424, AC-422): a name landed since, said in the API's words
  // alone: nothing of where it is held.
  it('says an approval refused for a name in use as the API does, and decides nothing', async () => {
    const said = 'The names “orders” and “Lines” are already in use, so nothing was approved.';
    const { onDecided } = shown(proposal({ replaces: null }), {
      status: 409,
      body: { error: said, names: ['orders', 'Lines'] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
    expect((await screen.findByRole('alert')).textContent).toBe(`Can’t approve: ${said}`);
    expect(onDecided).not.toHaveBeenCalled();
  });

  it('says a refusal naming what still uses a name in its own words, counted dependents and all (T451’s review)', async () => {
    shown(proposal({}), {
      status: 409,
      body: {
        error: '“orders” is still used by the chart “Margin” and 2 items in folders you can’t see.',
        charts: [{ id: 'c1', title: 'Margin' }],
        hidden: 2,
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Can’t approve: “orders” is still used by the chart “Margin” and 2 items in folders you can’t see.',
    );
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('names each break of an approval the publish check refused, and Approve waits (T451, state L)', async () => {
    const { onDecided } = shown(proposal({}), {
      status: 422,
      body: {
        error: '2 items would break, so nothing was approved.',
        errors: [
          {
            path: 'sales.yml',
            folderId: 'f2',
            folderPath: ['Shared', 'Sales', 'EMEA'],
            line: 34,
            column: 9,
            message: 'measure orders.avg_value: unknown member orders.amount_net',
          },
        ],
        hidden: 1,
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Can’t approve: 1 item would break');
    expect(screen.getByRole('listitem').textContent).toBe(
      'sales.yml · Sales / EMEA · line 34, column 9measure orders.avg_value: unknown member orders.amount_net',
    );
    expect(screen.getByText('1 item in a folder you can’t see would also break.')).toBeTruthy();
    // Nothing changed: approving again waits until something does.
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(onDecided).not.toHaveBeenCalled();
  });

  /**
   * T385 / AC-052: an approval may resolve calculation requests, so the
   * requests the approver has read are read again, not left showing open
   * (T385's review).
   */
  it('reads the calculation requests again once approved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'approved',
              landed: [{ kind: 'model', id: 'm1', version: 2 }],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const client = new QueryClient();
    client.setQueryData(['calc-requests'], []);
    const onDecided = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <DecisionPanel proposal={proposal({ kind: 'model' })} onDecided={onDecided} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
    await vi.waitFor(() => {
      expect(onDecided).toHaveBeenCalled();
    });
    expect(client.getQueryState(['calc-requests'])?.isInvalidated).toBe(true);
  });
});
