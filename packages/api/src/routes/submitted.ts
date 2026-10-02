/**
 * A workspace item waiting in an open proposal is frozen (T541, AC-388; the
 * user's answer, R52: "No edits on something that was submitted.. if it has
 * to change revert the submission, make changes and submit again"): every
 * change to it is refused, saying so, until the proposal is withdrawn or
 * decided. So what is approved is what was submitted.
 */
export const SUBMITTED = {
  error:
    'This was submitted for review, so it can’t be changed. Withdraw its proposal to change it, then propose it again.',
  code: 'submitted',
} as const;
