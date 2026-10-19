import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { ELEMENT_KINDS, TEXT_ELEMENT_LIMIT, textLinkProblem } from '@wechart/core';

import { insertRefusal } from './elementLimit';

/**
 * The Text tile's toolbar (T878, AC-515; design 21 pins 2–5, state A): a
 * `toolbar`, one Tab stop with ← and → along it (APG toolbar), holding the
 * block style, bold, italic, both lists, link, Insert and the element count,
 * and nothing for colour, font or size (rule 128): every block style is a
 * step of §3's type scale.
 */

/** The block styles, in the menu's order, each a step of §3's scale (direction §7h). */
export const BLOCK_STYLES = [
  { key: 'paragraph', name: 'Paragraph', type: 'text-sm' },
  { key: 'small', name: 'Heading small', type: 'text-md' },
  { key: 'medium', name: 'Heading medium', type: 'text-lg' },
  { key: 'large', name: 'Heading large', type: 'text-xl' },
  { key: 'value', name: 'Large value', type: 'text-kpi' },
] as const;

type BlockStyle = (typeof BLOCK_STYLES)[number]['key'];

/** Heading large, medium and small are levels 1, 2 and 3 (decision T868-1). */
const LEVELS = { large: 1, medium: 2, small: 3 } as const;

function blockOf(editor: Editor): BlockStyle {
  if (editor.isActive('largeValue')) return 'value';
  for (const [style, level] of Object.entries(LEVELS))
    if (editor.isActive('heading', { level })) return style as BlockStyle;
  return 'paragraph';
}

function setBlock(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === 'paragraph') chain.setNode('paragraph').run();
  else if (style === 'value') chain.setNode('largeValue').run();
  else chain.setNode('heading', { level: LEVELS[style] }).run();
}

/** How many elements the text holds: every live element, control and button (AC-518). */
function elementCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if ((ELEMENT_KINDS as readonly string[]).includes(node.type.name)) count += 1;
  });
  return count;
}

export function TextToolbar({
  editor,
  onInsert,
}: {
  readonly editor: Editor;
  /** Insert: the insert menu at the cursor (AC-517). */
  readonly onInsert?: (() => void) | undefined;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: now }) => ({
      block: blockOf(now),
      bold: now.isActive('bold'),
      italic: now.isActive('italic'),
      bulleted: now.isActive('bulletList'),
      numbered: now.isActive('orderedList'),
      linked: now.isActive('link'),
      count: elementCount(now),
    }),
  });
  const controls = useRef<(HTMLButtonElement | null)[]>([]);
  /** The control that is the toolbar's one Tab stop: the last one used. */
  const [at, setAt] = useState(0);
  const [menu, setMenu] = useState(false);
  const [linking, setLinking] = useState(false);
  const ids = { menu: useId(), button: useId(), full: useId() };

  const focusAt = (index: number) => {
    const all = controls.current.filter((control) => control !== null);
    const next = ((index % all.length) + all.length) % all.length;
    setAt(next);
    all[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // ↓ or ↑ on the menu button opens its menu (APG menu button).
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      event.target === controls.current[0]
    ) {
      event.preventDefault();
      setLinking(false);
      setMenu(true);
      return;
    }
    const last = controls.current.length - 1;
    const step =
      event.key === 'ArrowRight'
        ? at + 1
        : event.key === 'ArrowLeft'
          ? at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (step === undefined) return;
    event.preventDefault();
    focusAt(step);
  };

  /** A control of the strip: its place, its Tab stop, and the text keeps its selection under a click. */
  const control = (index: number, label: string, props: ControlProps) => (
    <button
      type="button"
      ref={(element) => {
        controls.current[index] = element;
      }}
      className={props.className ?? 'text-toolbar__button'}
      aria-label={label}
      tabIndex={index === at ? 0 : -1}
      {...(props.pressed === undefined ? {} : { 'aria-pressed': props.pressed })}
      {...(props.popup === undefined
        ? {}
        : { 'aria-haspopup': props.popup, 'aria-expanded': props.expanded ?? false })}
      {...(props.controls === undefined ? {} : { 'aria-controls': props.controls })}
      {...(props.id === undefined ? {} : { id: props.id })}
      {...(props.disabled === undefined
        ? {}
        : {
            'aria-disabled': true,
            'aria-describedby': props.disabled.id,
            title: props.disabled.why,
          })}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onFocus={() => {
        setAt(index);
      }}
      onClick={(event) => {
        /**
         * From the block-style menu or the link field, which a press here may
         * close: focus comes to this button first, so it isn't lost with what
         * held it (T878's review). From the text, it stays there.
         */
        if (!editor.view.dom.contains(window.document.activeElement)) event.currentTarget.focus();
        if (props.disabled === undefined) props.run();
      }}
    >
      {props.children}
    </button>
  );

  const current = BLOCK_STYLES.find((style) => style.key === state.block) ?? BLOCK_STYLES[0];
  const over = state.count > TEXT_ELEMENT_LIMIT;
  /** Why Insert is off: the text holds 10 elements (AC-518). */
  const full = insertRefusal(state.count);

  return (
    <>
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="text-toolbar"
        onKeyDown={onKeyDown}
      >
        {control(0, `Block style: ${current.name}`, {
          className: 'text-toolbar__button text-toolbar__block',
          id: ids.button,
          popup: 'menu',
          expanded: menu,
          controls: menu ? ids.menu : undefined,
          // As drawn: a press that first took focus from the open menu has
          // already closed it, and must not open it again.
          run: () => {
            setLinking(false);
            setMenu(!menu);
          },
          children: (
            <>
              <span className="text-toolbar__block-name">{current.name}</span>
              <span aria-hidden="true">▾</span>
            </>
          ),
        })}
        {control(1, 'Bold', {
          pressed: state.bold,
          run: () => editor.chain().focus().toggleBold().run(),
          children: <strong aria-hidden="true">B</strong>,
        })}
        {control(2, 'Italic', {
          pressed: state.italic,
          run: () => editor.chain().focus().toggleItalic().run(),
          children: <em aria-hidden="true">I</em>,
        })}
        {control(3, 'Bulleted list', {
          pressed: state.bulleted,
          run: () => editor.chain().focus().toggleBulletList().run(),
          children: <span aria-hidden="true">•≡</span>,
        })}
        {control(4, 'Numbered list', {
          pressed: state.numbered,
          run: () => editor.chain().focus().toggleOrderedList().run(),
          children: <span aria-hidden="true">1≡</span>,
        })}
        {control(5, 'Link', {
          pressed: state.linked,
          run: () => {
            setMenu(false);
            setLinking(!linking);
          },
          children: (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ),
        })}
        {control(6, 'Insert', {
          className: 'text-toolbar__button text-toolbar__insert',
          popup: 'listbox',
          disabled: full === undefined ? undefined : { why: full, id: ids.full },
          run: () => onInsert?.(),
          children: (
            <>
              <span aria-hidden="true">＋</span> Insert
            </>
          ),
        })}
        <span
          className="text-tile__count text-toolbar__count"
          data-testid="text-toolbar-count"
          data-state={over ? 'warning' : 'normal'}
        >
          {`${String(state.count)} / ${String(TEXT_ELEMENT_LIMIT)} elements`}
        </span>
        {full === undefined ? null : (
          <span id={ids.full} className="visually-hidden">
            {full}
          </span>
        )}
      </div>
      {menu ? (
        <BlockStyleMenu
          id={ids.menu}
          current={state.block}
          onChoose={(style) => {
            setMenu(false);
            setBlock(editor, style);
          }}
          onClose={(refocus) => {
            setMenu(false);
            if (refocus) controls.current[0]?.focus();
          }}
        />
      ) : null}
      {linking ? (
        <LinkForm
          editor={editor}
          onClose={(refocus) => {
            setLinking(false);
            if (refocus) controls.current[5]?.focus();
          }}
        />
      ) : null}
    </>
  );
}

interface ControlProps {
  readonly run: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly pressed?: boolean;
  readonly popup?: 'menu' | 'listbox';
  readonly expanded?: boolean;
  readonly id?: string;
  /** The popup it opens, while open. */
  readonly controls?: string | undefined;
  /** Why it can't be used now, its description; absent, it can (AC-518). */
  readonly disabled?: { readonly why: string; readonly id: string } | undefined;
}

/**
 * The block-style menu (APG menu button): each style named in its own type,
 * the current one checked. ↑ ↓ choose, Enter or Space takes one, Esc closes
 * it back on its button, and Tab closes it.
 */
function BlockStyleMenu({
  id,
  current,
  onChoose,
  onClose,
}: {
  id: string;
  current: BlockStyle;
  onChoose: (style: BlockStyle) => void;
  onClose: (refocus: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const items = () => [
    ...(box.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []),
  ];
  useEffect(() => {
    items()[0]?.focus();
  }, []);

  return (
    <div
      ref={box}
      id={id}
      role="menu"
      tabIndex={-1}
      aria-label="Block style"
      className="text-style-menu"
      onKeyDown={(event) => {
        const all = items();
        const index = all.indexOf(window.document.activeElement as HTMLElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          all[(index + step + all.length) % all.length]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          all[event.key === 'Home' ? 0 : all.length - 1]?.focus();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        } else if (event.key === 'Tab') {
          onClose(false);
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget))
          onClose(false);
      }}
    >
      {BLOCK_STYLES.map((style) => (
        <div
          key={style.key}
          role="menuitemradio"
          aria-checked={style.key === current}
          tabIndex={-1}
          className="text-style-menu__item"
          data-type={style.type}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            onChoose(style.key);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onChoose(style.key);
          }}
        >
          {style.name}
        </div>
      ))}
    </div>
  );
}

/**
 * Link's address (rule 42, AC-513): an http(s) address or a wechart
 * dashboard, as the Link/button tile takes; anything else is refused with its
 * reason. Empty removes the link. Over no selection, the address is put in as
 * its own linked text.
 */
function LinkForm({ editor, onClose }: { editor: Editor; onClose: (refocus: boolean) => void }) {
  const id = useId();
  const was: unknown = editor.getAttributes('link')['href'];
  const [address, setAddress] = useState(typeof was === 'string' ? was : '');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);

  const apply = () => {
    const href = address.trim();
    if (href === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose(false);
      return;
    }
    const refused = textLinkProblem(href);
    if (refused !== undefined) {
      setProblem(refused);
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link'))
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose(false);
  };

  return (
    <div
      className="text-link-form"
      // Closed once focus leaves it, for the text or another control.
      onBlur={(event) => {
        if (event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget))
          onClose(false);
      }}
    >
      <label htmlFor={id}>Link address</label>
      <input
        ref={field}
        id={id}
        type="text"
        value={address}
        placeholder="https://"
        aria-invalid={problem === undefined ? undefined : true}
        onChange={(event) => {
          setAddress(event.target.value);
          setProblem(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose(true);
          }
        }}
      />
      {problem === undefined ? null : (
        <p role="alert" className="text-link-form__problem">
          {problem}
        </p>
      )}
    </div>
  );
}
