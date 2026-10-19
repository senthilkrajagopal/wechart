import {
  Extension,
  InputRule,
  Node,
  textblockTypeInputRule,
  type Extensions,
  type JSONContent,
  type Range,
} from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';

import {
  ELEMENT_KINDS,
  elementAttributeNames,
  TEXT_DOCUMENT_VERSION,
  textLinkProblem,
  type TextDocument,
  type TextMark,
  type TextNode,
} from '@wechart/core';

import { ElementKeys, elementNodes } from './nodes/elementNodes';

/**
 * The Text tile's editor schema (T876; decision T868-1): Tiptap's own names
 * where StarterKit has the node, wechart's where it doesn't, so the editor
 * reads and writes the stored tree with no mapping. Anything StarterKit
 * brings that the stored schema doesn't have is off, so it can't be made.
 *
 * Research `rich-tiles-and-combo-tech.md` §1 (editor, node views, storage).
 */

/**
 * Heading large, medium and small (levels 1, 2 and 3), drawn as view mode
 * draws them — h3, h4 and h5, sized by `data-type` (decision T873-1) — so the
 * text doesn't change size as it becomes editable.
 */
const HEADINGS = {
  1: { tag: 'h3', type: 'text-xl' },
  2: { tag: 'h4', type: 'text-lg' },
  3: { tag: 'h5', type: 'text-md' },
} as const;

const levelOf = (value: unknown): 1 | 2 | 3 => (value === 2 || value === 3 ? value : 1);

const Heading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { level: { default: 1, rendered: false } };
  },
  /** `#`, `##` or `###` then a space: Heading large, medium or small (AC-516). */
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^(#{1,3})\s$/,
        type: this.type,
        getAttributes: (match) => ({ level: match[1]?.length ?? 1 }),
      }),
    ];
  },
  parseHTML() {
    return ([1, 2, 3] as const).map((level) => ({ tag: HEADINGS[level].tag, attrs: { level } }));
  },
  renderHTML({ node }) {
    const { tag, type } = HEADINGS[levelOf(node.attrs['level'])];
    return [tag, { 'data-type': type }, 0];
  },
});

/** Large value: a block of its own at `text-kpi` (design 21 pin 2). */
const LargeValue = Node.create({
  name: 'largeValue',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'p[data-type="text-kpi"]', priority: 60 }];
  },
  renderHTML() {
    return ['p', { class: 'text-tile__large', 'data-type': 'text-kpi' }, 0];
  },
});

/**
 * `[text](address)` typed: a link, where the address passes the link check
 * (AC-513, rule 42); otherwise it stays the text typed (AC-516). Undone by
 * the next ⌘Z, as every input rule is: Tiptap records the conversion as its
 * own history step after the typed character.
 */
const LinkPattern = Extension.create({
  name: 'linkPattern',
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^[\]]+)\]\(([^()\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, label, href] = match;
          const link = state.schema.marks['link'];
          if (label === undefined || href === undefined || link === undefined) return null;
          if (textLinkProblem(href) !== undefined) return null;
          const marks = state.doc.resolve(range.from).marks();
          state.tr
            .replaceWith(
              range.from,
              range.to,
              state.schema.text(label, [...marks, link.create({ href })]),
            )
            .removeStoredMark(link);
          return undefined;
        },
      }),
    ];
  },
});

/**
 * Only ⌘B, ⌘I and ⌘Z act inside the text (AC-516, approved under R75): the
 * other bindings StarterKit's extensions bring — redo, the list and
 * paragraph toggles, the line break — are taken and do nothing, ahead of
 * every other keymap. Typing's own keys (Enter, Backspace, Delete, the
 * arrows, select all) stay, as do the clipboard's. A key the editor leaves
 * alone (⌘U, ⇧⌘X) can still ask the browser to format the text or redo,
 * which is refused here too (decision T879-1).
 */
const OFF = [
  'Shift-Mod-z',
  'Mod-y',
  'Shift-Mod-я',
  'Mod-Alt-0',
  'Mod-Shift-7',
  'Mod-Shift-8',
  'Mod-Shift-9',
  'Mod-Enter',
  'Shift-Enter',
] as const;

const OnlyTheTextKeys = Extension.create({
  name: 'onlyTheTextKeys',
  priority: 10_000,
  addKeyboardShortcuts() {
    return Object.fromEntries(OFF.map((key) => [key, () => true]));
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('noBrowserFormatting'),
        props: {
          handleDOMEvents: {
            beforeinput: (_view, event) => {
              const { inputType } = event;
              if (!inputType.startsWith('format') && inputType !== 'historyRedo') return false;
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

/** What the insert menu's two triggers tell the editor (T881, AC-517). */
export interface InsertBridge {
  /** Opened, or what's typed after its trigger changed. */
  readonly open: (at: {
    readonly query: string;
    readonly range: Range;
    readonly rect: DOMRect | null;
    readonly started: boolean;
  }) => void;
  readonly close: () => void;
  /** A key while it's open; true when the menu took it. */
  readonly key: (event: KeyboardEvent, range: Range) => boolean;
}

const SLASH = new PluginKey('insertMenuSlash');
const BRACES = new PluginKey('insertMenuBraces');

/** Whether the insert menu is open, so Esc is the menu's, not the text's. */
export function insertMenuOpen(state: EditorState): boolean {
  return [SLASH, BRACES].some(
    (key) => (key.getState(state) as { active?: boolean } | undefined)?.active === true,
  );
}

/**
 * The insert menu's triggers, on `@tiptap/suggestion` (research §1): `/` at a
 * line's start or after a space, and `{{` — today's token syntax — anywhere.
 * Before the editor's own keys, so ↑ ↓ Enter → and Esc are the menu's while
 * it's open.
 */
const insertMenu = (bridge: InsertBridge) =>
  Extension.create({
    name: 'insertMenu',
    priority: 1000,
    addProseMirrorPlugins() {
      const render = () => ({
        onStart: (props: SuggestionProps) => {
          bridge.open({
            query: props.query,
            range: props.range,
            rect: props.clientRect?.() ?? null,
            started: true,
          });
        },
        onUpdate: (props: SuggestionProps) => {
          bridge.open({
            query: props.query,
            range: props.range,
            rect: props.clientRect?.() ?? null,
            started: false,
          });
        },
        onExit: () => {
          bridge.close();
        },
        onKeyDown: ({ event, range }: SuggestionKeyDownProps) => bridge.key(event, range),
      });
      return [
        Suggestion({
          editor: this.editor,
          pluginKey: SLASH,
          char: '/',
          render,
          /**
           * Only at a line's start or after a space (AC-517), judged on the
           * document: the trigger's own check reads one text node, so `/`
           * straight after emphasis or an element passed it (T881's review).
           * And never once `{{` is typed after it, which is the other
           * trigger's: one menu at a time.
           */
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            const before =
              $from.parentOffset === 0
                ? ' '
                : state.doc.textBetween(range.from - 1, range.from, '\n', '\u0000');
            return (
              (before === ' ' || before === ' ') &&
              !state.doc.textBetween(range.from, range.to).includes('{')
            );
          },
        }),
        Suggestion({
          editor: this.editor,
          pluginKey: BRACES,
          char: '{{',
          allowedPrefixes: null,
          render,
        }),
      ];
    },
  });

/** The editor's extensions: the stored schema's nodes and marks, and nothing else. */
export function textEditorExtensions(bridge?: InsertBridge): Extensions {
  return [
    OnlyTheTextKeys,
    ...(bridge === undefined ? [] : [insertMenu(bridge)]),
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      // It would add a paragraph after a list, changing a text nobody touched.
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        // Only an http(s) address or a wechart dashboard (rule 42, AC-513);
        // a pasted address is linked by `shouldAutoLink`, never `isAllowedUri`
        // (T876's review), so both ask.
        isAllowedUri: (url) => textLinkProblem(url) === undefined,
        shouldAutoLink: (url) => textLinkProblem(url) === undefined,
      },
    }),
    Heading,
    LargeValue,
    LinkPattern,
    ...elementNodes(),
    ElementKeys,
  ];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The attributes each node type keeps: the stored schema's, never Tiptap's defaults. */
const KEPT: Readonly<Record<string, readonly string[]>> = {
  heading: ['level'],
  orderedList: ['start'],
  ...Object.fromEntries(ELEMENT_KINDS.map((kind) => [kind, elementAttributeNames(kind)])),
};

const ELEMENTS = new Set<string>(ELEMENT_KINDS);

/**
 * A mark as stored: a link only to an address the schema takes (rule 42), and
 * never on an element (decision T868-1). A paste can make either — Tiptap
 * links a pasted address over the selection, elements in it too — and the
 * words stay, unlinked (T876's review).
 */
function markOf(mark: unknown, onElement: boolean): TextMark[] {
  if (!isRecord(mark) || typeof mark['type'] !== 'string') return [];
  if (mark['type'] !== 'link') return [{ type: mark['type'] }];
  const href = isRecord(mark['attrs']) ? mark['attrs']['href'] : undefined;
  return !onElement && typeof href === 'string' && textLinkProblem(href) === undefined
    ? [{ type: 'link', attrs: { href } }]
    : [];
}

/** What a list item may hold after its first paragraph: StarterKit's takes any block. */
const IN_LIST_ITEM = new Set(['paragraph', 'bulletList', 'orderedList']);

function nodeOf(input: JSONContent, parent?: string): TextNode {
  // A heading or Large value pasted into a list item is a paragraph there.
  const type =
    parent === 'listItem' && !IN_LIST_ITEM.has(input.type ?? '')
      ? 'paragraph'
      : (input.type ?? 'paragraph');
  const attrs = Object.fromEntries(
    (KEPT[type] ?? []).flatMap((name) => {
      const value: unknown = input.attrs?.[name];
      return value === null || value === undefined ? [] : [[name, value]];
    }),
  );
  const marks = (input.marks ?? []).flatMap((mark) => markOf(mark, ELEMENTS.has(type)));
  return {
    type,
    ...(Object.keys(attrs).length === 0 ? {} : { attrs }),
    ...(input.content === undefined
      ? {}
      : { content: input.content.map((child) => nodeOf(child, type)) }),
    ...(marks.length === 0 ? {} : { marks }),
    ...(typeof input.text === 'string' ? { text: input.text } : {}),
  };
}

/**
 * The editor's JSON as the stored schema has it (decision T868-3): Tiptap's
 * `getJSON()` writes every attribute an extension declares, defaults
 * included — a link's `target` and `rel`, a list's `type`, an element's
 * unset settings as null — and the API refuses any it doesn't declare.
 */
export function storedDocumentOf(json: JSONContent): TextDocument {
  return { version: TEXT_DOCUMENT_VERSION, doc: nodeOf(json) };
}

/** One node of the editor's JSON as stored: an element, for the Elements list (T882). */
export function storedNodeOf(json: JSONContent): TextNode {
  return nodeOf(json);
}
