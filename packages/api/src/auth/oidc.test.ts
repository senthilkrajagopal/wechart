import { describe, expect, it } from 'vitest';

import { identityFrom } from './oidc';

/**
 * T319 (AC-252; references.md › Phase 2 › Surface 1): the account menu shows,
 * under the name, the identity as the provider sent it. From the standard
 * claims (OIDC Core §5.1, research/dex.md and authelia.md): the email, else the
 * username, else the subject.
 */
describe('the identity the account menu shows', () => {
  it('is the email where the token has one', () => {
    expect(identityFrom({ sub: 's1', email: 'wren@example.com', preferred_username: 'wren' })).toBe(
      'wren@example.com',
    );
  });

  it('is the username without an email, and the subject without either', () => {
    expect(identityFrom({ sub: 's1', preferred_username: 'wren' })).toBe('wren');
    expect(identityFrom({ sub: 's1', email: '' })).toBe('s1');
  });

  it('skips a claim that isn’t text', () => {
    expect(identityFrom({ sub: 's1', email: ['a@example.com'] })).toBe('s1');
    expect(identityFrom({})).toBe('unknown');
  });
});
