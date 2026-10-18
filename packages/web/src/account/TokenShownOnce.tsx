import { useEffect, useId, useRef, useState } from 'react';

import { dayOf } from '../shell/formatTime';
import { useFocusTrap } from '../shell/useFocusTrap';
import { SCOPES, type MadeToken } from './tokensApi';

/** Claude Code's command, filled in (design 18, screen 3 pin 4; research `mcp-typescript-sdk.md`). */
export const claudeCodeCommand = (serverUrl: string, text: string) =>
  `claude mcp add --transport http wechart ${serverUrl} --header "Authorization: Bearer ${text}"`;

/**
 * The token, shown once (T770, AC-430; design 18, screen 3 and state C):
 * what was made, the warning that this is the only time, the text with
 * Copy, and the Claude Code command with it filled in. Done or Esc closes
 * it for good, asking first when nothing was copied (Q3). The text lives in
 * this dialog's props alone, so closing it leaves it nowhere.
 */
export function TokenShownOnce({
  made,
  serverUrl,
  onClose,
}: {
  readonly made: MadeToken;
  /** The MCP server's address, as the command names it; null where MCP isn't set up (T774). */
  readonly serverUrl: string | null;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  const [copied, setCopied] = useState<'text' | 'command' | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  // No command where MCP isn't set up: there is nothing to connect to (AC-476).
  const command = serverUrl === null ? null : claudeCodeCommand(serverUrl, made.text);

  /** Done, and Esc: at once after a Copy, else asked first. */
  const done = useRef(() => {});
  const isAsking = useRef(asking);
  useEffect(() => {
    done.current = () => {
      if (copied !== null) onClose();
      else setAsking(true);
    };
    isAsking.current = asking;
  }, [copied, asking, onClose]);
  // Leaving the page with it uncopied, by a reload, Back or a closed tab,
  // asks the browser's own question, as the new data source wizard does
  // (AC-430: "closing … without having copied it SHALL ask first").
  useEffect(() => {
    if (copied !== null) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [copied]);
  useEffect(() => {
    copyButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Esc at the question goes back to the token.
      if (isAsking.current) {
        setAsking(false);
        copyButton.current?.focus();
      } else done.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const copy = (what: 'text' | 'command') => {
    const clipboard = 'clipboard' in navigator ? navigator.clipboard : undefined;
    if (clipboard === undefined) {
      setFailed(true);
      return;
    }
    clipboard.writeText(what === 'text' || command === null ? made.text : command).then(
      () => {
        setCopied(what);
        setFailed(false);
      },
      () => {
        setFailed(true);
      },
    );
  };
  const scopes = SCOPES.filter((scope) => made.token.scopes.includes(scope.id))
    .map((scope) => scope.label)
    .join(', ');

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-heading`}
        className="dialog new-token token-once"
      >
        <h2 id={`${ids}-heading`}>Copy your token now</h2>
        <p className="token-once__made" data-testid="made">
          {made.token.name} · {scopes} · expires {dayOf(new Date(made.token.expiresAt))}
        </p>
        <p className="token-once__warning" role="note">
          <WarningIcon />
          <span>
            This is the only time wechart shows it. Copy it now and keep it somewhere safe, such as
            a password manager. Anyone holding it can act as you until it expires or you revoke it.
          </span>
        </p>
        <div className="token-once__row">
          <label className="new-token__label" htmlFor={`${ids}-text`}>
            Your token
          </label>
          <input
            id={`${ids}-text`}
            type="text"
            readOnly
            spellCheck={false}
            className="token-once__text"
            value={made.text}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <button
            ref={copyButton}
            type="button"
            className="btn btn-primary"
            onClick={() => {
              copy('text');
            }}
          >
            {copied === 'text' ? (
              <>
                <CheckIcon />
                Copied
              </>
            ) : (
              'Copy'
            )}
          </button>
        </div>
        {command === null ? null : (
          <div className="token-once__row">
            <label className="new-token__label" htmlFor={`${ids}-command`}>
              Add wechart to Claude Code, in a terminal
            </label>
            <textarea
              id={`${ids}-command`}
              readOnly
              spellCheck={false}
              rows={3}
              className="token-once__command"
              value={command}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                copy('command');
              }}
            >
              {copied === 'command' ? (
                <>
                  <CheckIcon />
                  Copied command
                </>
              ) : (
                'Copy command'
              )}
            </button>
          </div>
        )}
        {/* "Copied", said politely (design 18's keyboard and screen-reader row). */}
        <span role="status" aria-live="polite" className="visually-hidden">
          {copied === null ? '' : 'Copied'}
        </span>
        {failed ? (
          <p role="alert" className="propose-dialog__refused">
            It couldn’t be copied here: select it and copy it yourself.
          </p>
        ) : null}
        <div className="dialog__actions token-once__actions">
          <span className="token-once__closing">Closing hides it for good.</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              done.current();
            }}
          >
            Done
          </button>
        </div>
      </div>
      {asking ? (
        <CloseUncopied
          onBack={() => {
            setAsking(false);
            copyButton.current?.focus();
          }}
          onClose={onClose}
        />
      ) : null}
    </div>
  );
}

/** Design 18, C2: asked before the text is closed uncopied; focus on going back. */
function CloseUncopied({
  onBack,
  onClose,
}: {
  readonly onBack: () => void;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  useEffect(() => back.current?.focus(), []);
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        className="dialog"
      >
        <h2 id={`${ids}-title`}>Close without copying?</h2>
        <p id={`${ids}-body`}>
          You won’t be able to see this token again. You’d have to revoke it and make another.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn" ref={back} onClick={onBack}>
            Go back and copy it
          </button>
          <button type="button" className="btn-primary dialog__destructive" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-icon="warning">
      <path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 6.2v3.6M8 11.4v1.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-icon="check">
      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
