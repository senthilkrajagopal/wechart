import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RequestChange } from './RequestChange';

/**
 * T717 (AC-283; R73): a use-only copy is proposed to no folder, so its page
 * offers "Request a change": a calculation request (AC-050) for its cube,
 * with no chart and no fields, asked of the folder whose model defines it.
 */
describe('Request a change, on a use-only copy’s page (T717, AC-283)', () => {
  it('opens a request for its cube, saying who it goes to, and sends its cube and description alone', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: 'r1' }), { status: 201 }),
    ) as unknown as typeof fetch;
    render(<RequestChange cube="regions" cubeTitle="Regions" fetchImpl={fetchImpl} />);

    await userEvent.click(screen.getByRole('button', { name: 'Request a change' }));
    const dialog = screen.getByRole('dialog', { name: 'Request a change' });
    expect(within(dialog).getByTestId('request-note').textContent).toBe(
      'Describe the change you need to Regions. It goes to the people who may change the model that defines it.',
    );
    expect(within(dialog).queryByTestId('request-fields')).toBeNull();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'What should change?' }),
      'A margin measure',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(within(dialog).getByRole('status').textContent).toBe(
        'Sent. It’s listed for them under Reviews › Calculation requests.',
      );
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/calc-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cube: 'regions', description: 'A margin measure' }),
    });
  });

  it('says why a request was refused', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'No shared folder’s model defines regions.' }), {
          status: 409,
        }),
    ) as unknown as typeof fetch;
    render(<RequestChange cube="regions" cubeTitle="Regions" fetchImpl={fetchImpl} />);
    await userEvent.click(screen.getByRole('button', { name: 'Request a change' }));
    const dialog = screen.getByRole('dialog', { name: 'Request a change' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => {
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'No shared folder’s model defines regions.',
      );
    });
  });
});
