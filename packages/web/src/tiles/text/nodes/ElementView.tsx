import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';

import { CONTROL_KINDS, type ControlKind, type TextNode } from '@wechart/core';

import { elementName, elementParts, type ElementNames } from '../elementName';

/**
 * How elements' sources read in the editor, through context: node views are
 * portals inside the editor's content, which the editor wraps in this
 * provider (research §1, "wrap EditorContent in a provider").
 */
export const ElementNamesContext = createContext<ElementNames>({
  measure: (member) => member,
  measurePath: (member) => member,
  filter: () => undefined,
  parameter: () => undefined,
});

const isControl = (type: string): type is ControlKind =>
  (CONTROL_KINDS as readonly string[]).includes(type);

/**
 * An element in the text being edited (T882, AC-519; design 21 pin 7, state
 * L; rule 130): an atom at the text's own size, outlined on `bg-subtle`,
 * named by its kind and source. A control or button is drawn as itself,
 * inert, so a click selects it rather than working it. Its values are drawn
 * by its kind's own task (T884–T886); until then a live element shows what
 * it's of.
 */
export function ElementView({ node }: ReactNodeViewProps) {
  const names = useContext(ElementNamesContext);
  const element: TextNode = { type: node.type.name, attrs: node.attrs };
  const { source } = elementParts(element, names);
  const control = isControl(node.type.name);
  const style = node.attrs['style'];
  return (
    <NodeViewWrapper
      as="span"
      role="img"
      aria-label={elementName(element, names)}
      data-element={node.type.name}
      className={control ? 'text-element text-element--control' : 'text-element'}
    >
      {control ? (
        // Inert: drawn as a reader sees it, worked by nobody while editing.
        <span inert className="text-element__control">
          {node.type.name === 'actionButton' ? (
            <span
              className={
                style === 'primary'
                  ? 'text-element__button text-element__button--primary'
                  : style === 'text'
                    ? 'text-element__button text-element__button--text'
                    : 'text-element__button'
              }
            >
              {source}
            </span>
          ) : (
            <span className="text-element__pill">
              {node.type.name === 'parameterControl' ? source : `${source}: all`}
            </span>
          )}
        </span>
      ) : (
        source
      )}
    </NodeViewWrapper>
  );
}
