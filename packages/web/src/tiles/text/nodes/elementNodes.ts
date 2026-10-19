import { Extension, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ELEMENT_KINDS, elementAttributeNames, type ElementKind } from '@wechart/core';

import { ElementView } from './ElementView';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

/**
 * One element kind's node (T876, T882; decision T868-1; AC-519): an inline
 * atom, which may be bold or italic and never a link, declaring exactly the
 * attributes the schema gives its kind, none of them drawn onto the DOM. In
 * the editor it's drawn by `ElementView` (`ReactNodeViewRenderer`, research
 * §1); its HTML is the clipboard's, read back on paste with its settings in
 * `data-attrs` (T876's review).
 */
export const elementNode = (kind: ElementKind) =>
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
    parseHTML() {
      return [
        {
          tag: `span[data-element="${kind}"]`,
          getAttrs: (element) => settingsOf(kind, element.getAttribute('data-attrs')),
        },
      ];
    },
    renderHTML({ node }) {
      const settings = Object.fromEntries(
        Object.entries(node.attrs).filter(([, value]) => value !== null && value !== undefined),
      );
      return [
        'span',
        { class: 'text-element', 'data-element': kind, 'data-attrs': JSON.stringify(settings) },
        kind,
      ];
    },
    addNodeView() {
      return ReactNodeViewRenderer(ElementView, { as: 'span', className: 'text-element-view' });
    },
  });

/** Every element kind's node. */
export const elementNodes = () => ELEMENT_KINDS.map(elementNode);

const ELEMENTS = new Set<string>(ELEMENT_KINDS);

/**
 * Backspace just after an element, and Delete just before one, remove it
 * whole (AC-519), in every browser alike rather than as each deletes a
 * non-editable span.
 */
export const ElementKeys = Extension.create({
  name: 'elementKeys',
  priority: 900,
  addKeyboardShortcuts() {
    const removeBeside = (before: boolean) => () => {
      const { selection } = this.editor.state;
      if (!selection.empty) return false;
      const { $from } = selection;
      const node = before ? $from.nodeBefore : $from.nodeAfter;
      if (node === null || !ELEMENTS.has(node.type.name)) return false;
      const from = before ? $from.pos - node.nodeSize : $from.pos;
      return this.editor.commands.deleteRange({ from, to: from + node.nodeSize });
    };
    /**
     * ← and → step over an element as one character, selecting it on the
     * way (AC-519). ProseMirror selects it from just beside it; but Chrome
     * moves the caret from one character away straight past it (prosemirror
     * #937), so that one step is taken here, landing beside it.
     */
    const step = (dir: -1 | 1) => () => {
      const { selection, doc } = this.editor.state;
      if (!selection.empty) return false;
      const { $head } = selection;
      const beside = dir < 0 ? $head.nodeBefore : $head.nodeAfter;
      if (beside === null || !beside.isText || $head.pos + dir < $head.start()) return false;
      if ($head.pos + dir > $head.end()) return false;
      const $next = doc.resolve($head.pos + dir);
      const next = dir < 0 ? $next.nodeBefore : $next.nodeAfter;
      if (next === null || !ELEMENTS.has(next.type.name)) return false;
      return this.editor.commands.setTextSelection($head.pos + dir);
    };
    return {
      Backspace: removeBeside(true),
      Delete: removeBeside(false),
      ArrowLeft: step(-1),
      ArrowRight: step(1),
    };
  },
});
