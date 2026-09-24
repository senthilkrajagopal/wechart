import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TileLoadError } from '../query/loadTile';
import { hiddenMemberOf, TileUnavailable } from './TileUnavailable';

/**
 * T173 / AC-167: WHEN a preview context hides a member a chart uses, THE
 * SYSTEM SHALL show that tile as unavailable to the context rather than as an
 * error.
 * Fails when: the tile shows a raw Cube error.
 *
 * Cube answers a member no policy grants the context with HTTP 500, "You
 * requested hidden member: '<member>'. Please make it visible using `public:
 * true`. …" (research/cube/access-control.md, "Observed locally").
 */
const HIDDEN =
  "Error: You requested hidden member: 'secured_orders.count'. Please make it visible using `public: true`. Please note primaryKey fields are `public: false` by default.";

describe('hiddenMemberOf', () => {
  it('reads the member Cube says it refused the context', () => {
    expect(hiddenMemberOf(new TileLoadError(HIDDEN, {}, 500))).toBe('secured_orders.count');
  });

  it('reads nothing from any other failure', () => {
    expect(
      hiddenMemberOf(new TileLoadError("Can't find join path to join 'a', 'b'", {}, 400)),
    ).toBe(undefined);
    expect(hiddenMemberOf('not an error')).toBe(undefined);
  });
});

describe('TileUnavailable', () => {
  it('says the tile is unavailable to the context, naming the member, and not as an error', () => {
    render(<TileUnavailable member="secured_orders.count" />);

    const tile = screen.getByTestId('tile-unavailable');
    expect(tile.textContent).toContain('Not available to this security context');
    // The member Cube named, and not as the whole list: Cube names only one.
    expect(tile.textContent).toContain(
      'Cube refuses it secured_orders.count, and may refuse other fields this chart uses.',
    );
    // Not Cube's message, and not announced as a failure.
    expect(tile.textContent).not.toContain('Please make it visible');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // T232 / AC-220: by the member's title, where the model gives one.
  it('names the member by its title, given one', () => {
    render(<TileUnavailable member="secured_orders.count" title="Secured orders Count" />);

    const tile = screen.getByTestId('tile-unavailable');
    expect(tile.textContent).toContain('Cube refuses it Secured orders Count, and may refuse');
    expect(tile.textContent).not.toContain('secured_orders.count');
  });
});
