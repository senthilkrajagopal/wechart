import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { PROPOSAL_TEXT_LIMIT } from '../explore/ProposeDialog';
import { Refusal } from './Refusal';
import { DecisionRefused, decide, shownItems, type ProposalDetail } from './review';
import { folderText } from './reviews';

/**
 * Approve and Reject, only here (T356; design 05, states I, J, K and L;
 * rules 77, 78, 85; AC-286, AC-288, AC-290):
 * - Approve asks first, anchored to it, naming the folder and where the
 *   replaced version goes; focus is held in it and Esc cancels.
 * - Reject reveals an optional reason with a live counter, at most 1,000
 *   characters and never cut.
 * - The author's own is "Approve my own proposal", said to be recorded, and
 *   their reject is "Withdraw…".
 * - A refused approval says why, and changes nothing.
 * Only what the user may do is offered.
 */
const count = new Intl.NumberFormat('en');

export function DecisionPanel({
  proposal,
  onDecided,
}: {
  readonly proposal: ProposalDetail;
  /** Decided: what to say of it. */
  readonly onDecided: (said: string) => void;
}) {
  const ids = useId();
  const client = useQueryClient();
  const [step, setStep] = useState<'idle' | 'confirming' | 'rejecting'>('idle');
  const [reason, setReason] = useState('');
  const approveButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const folder = folderText(proposal.targetPath);

  const decision = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      decide(proposal.id, action, action === 'reject' && reason.trim() !== '' ? { reason } : {}),
    onSuccess: (answer, action) => {
      void client.invalidateQueries({ queryKey: ['proposal', proposal.id] });
      void client.invalidateQueries({ queryKey: ['reviews'] });
      void client.invalidateQueries({ queryKey: ['proposal-of'] });
      setStep('idle');
      if (action === 'approve') {
        const first = answer.landed?.find((each) => each.kind === proposal.kind);
        onDecided(
          first === undefined
            ? `Approved. It’s in ${folder}.`
            : `Approved. ${folder} now shows version ${String(first.version)}.`,
        );
      } else
        onDecided(
          proposal.yours
            ? 'Withdrawn. Your workspace keeps the work.'
            : `Rejected. ${proposal.author.name}’s workspace keeps the work.`,
        );
    },
    onError: () => {
      setStep('idle');
    },
  });

  // Where focus goes as a step opens, and back to its button as it closes.
  const confirmButton = useRef<HTMLButtonElement>(null);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const lastStep = useRef(step);
  useEffect(() => {
    if (step === 'confirming') confirmButton.current?.focus();
    else if (step === 'rejecting') reasonField.current?.focus();
    else if (lastStep.current === 'confirming') approveButton.current?.focus();
    else if (lastStep.current === 'rejecting') rejectButton.current?.focus();
    lastStep.current = step;
  }, [step]);

  // While Approve asks, Esc cancels and Tab keeps to its two buttons (rule 85).
  const confirmBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== 'confirming') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const box = confirmBox.current;
      if (box === null || !box.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setStep('idle');
      } else if (event.key === 'Tab') {
        const buttons = [...box.querySelectorAll('button')];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey
          ? (at - 1 + buttons.length) % buttons.length
          : (at + 1) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [step]);

  const length = [...reason].length;
  const over = length > PROPOSAL_TEXT_LIMIT;
  const [first, ...others] = shownItems(proposal);
  // What an approval replaces is what the folder has now (design 05, state I).
  const keptVersion = first?.replacesNow ?? undefined;
  const refused = decision.error instanceof DecisionRefused ? decision.error : undefined;

  return (
    <div className="review-decision">
      {proposal.yours && proposal.mayApprove ? (
        <p className="review-decision__note">
          You proposed this. Approving your own proposal is allowed and is recorded in the audit
          trail.
        </p>
      ) : null}

      {refused?.checked === true ? (
        // The publish check's own refusal: each break named or counted (state L).
        <Refusal breaks={refused.breaks} hidden={refused.hidden} />
      ) : decision.isError ? (
        <div role="alert" className="review-decision__refused">
          <p>
            {decision.variables === 'approve' ? 'Can’t approve: ' : 'Can’t reject: '}
            {decision.error.message}
          </p>
          {refused !== undefined && refused.problems.length > 0 ? (
            <ul>
              {refused.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {step === 'rejecting' ? (
        <div className="field review-decision__reason">
          <div className="propose-dialog__label-row">
            <label htmlFor={`${ids}-reason`}>
              Reason <span className="propose-dialog__optional">· optional</span>
            </label>
            <span
              className={`propose-dialog__counter${over ? ' is-over' : ''}`}
              data-testid="reason-counter"
            >
              {count.format(length)} / 1,000
            </span>
          </div>
          <textarea
            id={`${ids}-reason`}
            ref={reasonField}
            rows={4}
            value={reason}
            aria-invalid={over}
            aria-describedby={over ? `${ids}-over` : undefined}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setStep('idle');
              }
            }}
          />
          {over ? (
            <p id={`${ids}-over`} className="propose-dialog__over">
              Shorten to 1,000 characters.
            </p>
          ) : null}
          <div className="review-decision__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStep('idle');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={over || decision.isPending}
              onClick={() => {
                decision.mutate('reject');
              }}
            >
              {proposal.yours ? 'Withdraw' : 'Reject'}
            </button>
          </div>
        </div>
      ) : (
        // The panel's footer (design 05, pin 8): Reject at its start, Approve at its end (T544, AC-390).
        <div
          role="group"
          aria-label="Decide"
          className="review-decision__actions review-decision__foot"
        >
          {proposal.mayReject ? (
            <button
              type="button"
              ref={rejectButton}
              className="btn"
              disabled={decision.isPending}
              onClick={() => {
                decision.reset();
                setStep('rejecting');
              }}
            >
              {proposal.yours ? 'Withdraw…' : 'Reject…'}
            </button>
          ) : null}
          {proposal.mayApprove ? (
            <span className="review-decision__anchor">
              <button
                type="button"
                ref={approveButton}
                className="btn btn-primary"
                aria-haspopup="dialog"
                aria-expanded={step === 'confirming'}
                // Refused by the check, nothing changed: approving again waits (state L).
                disabled={decision.isPending || refused?.checked === true}
                onClick={() => {
                  decision.reset();
                  setStep('confirming');
                }}
              >
                {proposal.yours ? 'Approve my own proposal' : 'Approve'}
              </button>
              {step === 'confirming' ? (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`${ids}-confirm`}
                  className="review-decision__confirm"
                  ref={confirmBox}
                >
                  <h3 id={`${ids}-confirm`}>Publish to {folder}?</h3>
                  <p>
                    Readers see it at once.
                    {proposal.replaces === null
                      ? ''
                      : ` Version ${String(keptVersion ?? proposal.replaces.version)} stays in History.`}
                    {others.length === 0
                      ? ''
                      : ` ${others.map((item) => item.title).join(', ')} ${others.length === 1 ? 'is' : 'are'} published with it.`}
                  </p>
                  <div className="review-decision__actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setStep('idle');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      ref={confirmButton}
                      className="btn btn-primary"
                      disabled={decision.isPending}
                      onClick={() => {
                        decision.mutate('approve');
                      }}
                    >
                      Approve and publish
                    </button>
                  </div>
                </div>
              ) : null}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
