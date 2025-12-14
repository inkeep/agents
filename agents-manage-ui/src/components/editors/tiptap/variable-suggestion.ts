import { autoUpdate, computePosition, flip, type ReferenceElement, shift } from '@floating-ui/dom';
import type { MarkdownTokenizer } from '@tiptap/core';
import { Mention } from '@tiptap/extension-mention';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import { badgeVariants } from '@/components/ui/badge';
import {
  buildVariableItems,
  VariableList,
  type VariableListProps,
  type VariableListRef,
} from './variable-list';

const TOKEN_NAME = 'variableSuggestion';
const TRIGGER_CHAR = '{';

function updatePosition(virtualElement: ReferenceElement, element: HTMLElement) {
  computePosition(virtualElement, element, {
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [shift(), flip()],
  }).then(({ x, y, strategy }) => {
    element.style.width = 'max-content';
    element.style.position = strategy;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  });
}

const variableSuggestionTokenizer: MarkdownTokenizer = {
  name: TOKEN_NAME,
  level: 'inline',
  start: (src) => src.indexOf('{{'),
  tokenize(src) {
    const match = src.match(/^\{\{([^{}]+)}}/);
    if (!match) {
      return;
    }
    const [raw, id] = match;
    return {
      type: TOKEN_NAME,
      raw,
      id: id.trim(),
    };
  },
};

/**
 * Updated the prompt mention handling so TipTap now serializes mentions to {{var}} instead of [@ id="..." char="{"] and still renders them as violet badges.
 */
export const variableSuggestionExtension = Mention.extend({
  markdownTokenName: TOKEN_NAME,
  markdownTokenizer: variableSuggestionTokenizer,
  parseMarkdown(token, helpers) {
    const { id } = token;
    return helpers.createNode(
      'mention',
      {
        id,
        mentionSuggestionChar: TRIGGER_CHAR,
      },
      [helpers.createTextNode(id)]
    );
  },
  renderMarkdown(node) {
    const label = node.attrs?.id;
    return label ? `{{${label}}}` : '';
  },
  renderHTML({ node }) {
    const className = badgeVariants({ variant: 'violet' });
    return ['span', { class: className }, `{{${node.attrs.id}}}`];
  },
}).configure({
  suggestion: {
    char: TRIGGER_CHAR,
    items: buildVariableItems,
    render() {
      let component: ReactRenderer<VariableListRef, VariableListProps>;
      let cleanup: () => void;
      let virtualElement: ReferenceElement;

      return {
        onStart(props) {
          const { editor } = props;
          virtualElement = {
            getBoundingClientRect() {
              return posToDOMRect(
                editor.view,
                editor.state.selection.from,
                editor.state.selection.to
              );
            },
            // Provide a DOM context so floating-ui can track scroll/resize ancestors.
            contextElement: editor.view.dom,
          };
          component = new ReactRenderer(VariableList, { props, editor });

          if (!props.clientRect) {
            return;
          }
          const el = component.element;
          el.style.position = 'absolute';
          document.body.append(el);

          // Keep the menu positioned when the editable area scrolls.
          updatePosition(virtualElement, el);
          cleanup = autoUpdate(
            virtualElement,
            el,
            () => updatePosition(virtualElement, el),
            // With a virtual reference, rely on animation frames so scrolling
            // inside the editor keeps the list aligned.
            { animationFrame: true }
          );
        },

        onUpdate(props) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          updatePosition(virtualElement, component.element);
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            component.destroy();
            return true;
          }
          if (component.ref) {
            return component.ref.onKeyDown(props);
          }
          return false;
        },

        onExit() {
          cleanup?.();
          component.element.remove();
          component.destroy();
        },
      };
    },
  },
});
