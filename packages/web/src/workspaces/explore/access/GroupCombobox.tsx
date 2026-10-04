import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

export type AccessLevel = 'readWrite' | 'readOnly';

/** A group set on folders the editor may see, and where, said as the picker says it. */
export interface UsedGroup {
  readonly group: string;
  readonly where: string;
}

interface Option {
  readonly group: string;
  /** "yours", where it is used, or none for the typed one. */
  readonly hint: string | undefined;
  readonly typed: boolean;
}

/**
 * The Access panel's group picker, opened by a list's Add group (T330,
 * redrawn by T473 as the 2026-09-27 design 07, pin 7 and state A; direction
 * rule 64): labelled "AD group", its suggestions in two groups, "Your
 * groups" and "Used on other folders" with where, and anything else "as
 * typed". It names groups only, never a person (AC-259), and leaves out the
 * groups the list already has.
 *
 * The APG combobox with a list popup: Down and Up move through the
 * suggestions, Enter takes the one active, or what is typed; Escape closes
 * the suggestions, then the box. Its Escapes are its own, not the panel's.
 */
export function GroupCombobox({
  inputRef,
  mine,
  used,
  taken,
  onAdd,
  onClose,
}: {
  /** The box, for its owner to give focus back to. */
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  /** The editor's own groups. */
  readonly mine: readonly string[];
  readonly used: readonly UsedGroup[];
  /** Already in the list: not offered again. */
  readonly taken: ReadonlySet<string>;
  readonly onAdd: (group: string) => void;
  /** Closes the box from it: focus goes back to its Add group. */
  readonly onClose: () => void;
}) {
  const ids = useId();
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const [typed, setTyped] = useState('');
  // Opened by its Add group, focused, with its suggestions in view.
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);

  // Focused as it opens; the ref is the same one for the box's life.
  useEffect(() => input.current?.focus(), [input]);

  const named = typed.trim();
  const needle = named.toLowerCase();
  const fits = (group: string) => !taken.has(group) && group.toLowerCase().includes(needle);
  const yours = [...new Set(mine)].filter(fits).sort();
  const others = used
    .filter((each) => !mine.includes(each.group) && fits(each.group))
    .sort((a, b) => a.group.localeCompare(b.group));
  const offered = [...yours, ...others.map((each) => each.group)];
  const asTyped = named !== '' && !taken.has(named) && !offered.includes(named);
  const options: readonly Option[] = [
    ...yours.map((group) => ({ group, hint: 'yours', typed: false })),
    ...others.map((each) => ({ group: each.group, hint: each.where, typed: false })),
    ...(asTyped ? [{ group: named, hint: undefined, typed: true }] : []),
  ];
  const listed = open && options.length > 0;
  const optionId = (at: number) => `${ids}-option-${String(at)}`;

  const take = (group: string) => {
    onAdd(group);
    setTyped('');
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        setActive((at) => Math.min(at + 1, options.length - 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setOpen(true);
        setActive((at) => (at < 0 ? options.length - 1 : Math.max(at - 1, 0)));
        return;
      case 'Enter': {
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        const chosen = listed && active >= 0 ? options[active] : undefined;
        if (chosen !== undefined) take(chosen.group);
        else if (named !== '' && !taken.has(named)) take(named);
        return;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        if (listed) {
          setOpen(false);
          setActive(-1);
        } else {
          onClose();
        }
        return;
      default:
    }
  };

  const optionOf = (option: Option, at: number) => (
    <div
      key={`${option.typed ? 'typed' : 'group'}-${option.group}`}
      id={optionId(at)}
      role="option"
      // Never focused: the box keeps focus, naming the active one (APG).
      tabIndex={-1}
      aria-selected={at === active}
      className={option.typed ? 'group-combobox__option is-typed' : 'group-combobox__option'}
      // Taken by pointer as by Enter; the box keeps focus (as the search palette's).
      onMouseDown={(event) => {
        event.preventDefault();
        take(option.group);
      }}
    >
      {option.typed ? (
        <>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {`Add “${option.group}” as typed`}
        </>
      ) : (
        <>
          <code>{option.group}</code>
          <span className="group-combobox__hint">{option.hint}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="group-combobox">
      <label htmlFor={`${ids}-input`}>AD group</label>
      <input
        id={`${ids}-input`}
        ref={input}
        role="combobox"
        aria-expanded={listed}
        aria-controls={listed ? `${ids}-list` : undefined}
        aria-autocomplete="list"
        aria-activedescendant={listed && active >= 0 ? optionId(active) : undefined}
        placeholder="Group, as your identity provider sends it"
        autoComplete="off"
        spellCheck={false}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        // The box stays until Escape, or another list's Add group, so a click
        // that leaves it lands where it was aimed, not where the page moved to.
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {listed ? (
        <div
          id={`${ids}-list`}
          role="listbox"
          aria-label="AD group suggestions"
          className="group-combobox__list"
        >
          {yours.length === 0 ? null : (
            <div role="group" aria-labelledby={`${ids}-yours`}>
              <div id={`${ids}-yours`} className="group-combobox__head">
                Your groups
              </div>
              {options.slice(0, yours.length).map((option, at) => optionOf(option, at))}
            </div>
          )}
          {others.length === 0 ? null : (
            <div role="group" aria-labelledby={`${ids}-used`}>
              <div id={`${ids}-used`} className="group-combobox__head">
                Used on other folders
              </div>
              {options
                .slice(yours.length, yours.length + others.length)
                .map((option, at) => optionOf(option, yours.length + at))}
            </div>
          )}
          {asTyped ? optionOf(options[options.length - 1]!, options.length - 1) : null}
        </div>
      ) : null}
    </div>
  );
}
