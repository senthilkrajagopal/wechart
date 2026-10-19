import { Node, type Extensions, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import {
  ELEMENT_KINDS,
  elementAttributeNames,
  TEXT_DOCUMENT_VERSION,
  textLinkProblem,
  type ElementKind,
  type TextDocument,
  type TextMark,
  type TextNode,
} from '@wechart/core';

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

/** What an element reads as in the editor until each kind has its own (T882). */
const ELEMENT_WORDS: Readonly<Record<ElementKind, string>> = {
  value: 'Value',
  change: 'Change',
  sparkline: 'Sparkline',
  icon: 'Icon',
  bulletGraph: 'Bullet graph',
  marking: 'Marking',
  filterValue: 'Filter value',
  asOf: 'As of',
  filterControl: 'Filter control',
  parameterControl: 'Parameter control',
  actionButton: 'Button',
};

/**
 * One element kind: an inline atom, which may be bold or italic and never a
 * link (decision T868-1), declaring exactly the attributes the schema gives
 * its kind, none of them drawn onto the DOM.
 */
const elementNode = (kind: ElementKind) =>
  Node.create({
    name: kind,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    marks: 'bold italic',
    addAttributes() {
      return Object.fromEntries(
        elementAttributeNames(kind).map((name) => [name, { default: null, rendered: false }]),
      );
    },
    /**
     * Read back from the clipboard: ProseMirror pastes through the HTML a
     * copy or cut wrote, so an element's settings travel in `data-attrs`
     * (T876's review). Only what its kind declares is taken; the stored
     * schema's check still judges the values (T868, AC-513).
     */
    parseHTML() {
      return [
        {
          tag: `span[data-element="${kind}"]`,
          getAttrs: (element) => settingsOf(kind, element.getAttribute('data-attrs')),
        },
      ];
    },
    renderHTML({ node }) {
      const source = ['measure', 'marking', 'filter', 'parameter', 'label']
        .map((name) => node.attrs[name] as unknown)
        .find((value): value is string => typeof value === 'string');
      const settings = Object.fromEntries(
        Object.entries(node.attrs).filter(([, value]) => value !== null && value !== undefined),
      );
      return [
        'span',
        { class: 'text-element', 'data-element': kind, 'data-attrs': JSON.stringify(settings) },
        source === undefined ? ELEMENT_WORDS[kind] : `${ELEMENT_WORDS[kind]} · ${source}`,
      ];
    },
  });

/** An element's settings as its copy wrote them: only the ones its kind declares. */
function settingsOf(kind: ElementKind, written: string | null): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(written ?? '{}');
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  return Object.fromEntries(
    elementAttributeNames(kind).flatMap((name) =>
      Object.hasOwn(parsed, name) ? [[name, parsed[name]]] : [],
    ),
  );
}

/** The editor's extensions: the stored schema's nodes and marks, and nothing else. */
export function textEditorExtensions(): Extensions {
  return [
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
    ...ELEMENT_KINDS.map(elementNode),
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
