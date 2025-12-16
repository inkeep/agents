import { autoUpdate, computePosition, flip, type ReferenceElement, shift } from '@floating-ui/dom';
import { type MarkdownTokenizer, mergeAttributes } from '@tiptap/core';
import { Mention } from '@tiptap/extension-mention';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import { badgeVariants } from '@/components/ui/badge';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { monacoStore } from '@/features/agent/state/use-monaco-store';
import { VariableList, type VariableListProps } from './variable-list';

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
const VariableSuggestionExtension = Mention.extend({
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
  renderText({ node }) {
    const label = node.attrs?.id;
    return label ? `{{${label}}}` : '';
  },
  renderHTML({ node, HTMLAttributes }) {
    // I didn't find a way get current contentType from TipTap editor instance
    const isMarkdown = agentStore.getState().isMarkdownEditor;
    const content = `{{${node.attrs.id}}}`;
    if (!isMarkdown) {
      // We don't append badge class for text
      return ['span', HTMLAttributes, content];
    }
    return ['span', mergeAttributes(HTMLAttributes, this.options.HTMLAttributes), content];
  },
});

/**
 * Based on Tiptap mention example
 * @see https://github.com/ueberdosis/tiptap/blob/main/demos/src/Nodes/Mention/React/suggestion.js
 */
export const variableSuggestionExtension = VariableSuggestionExtension.configure({
  HTMLAttributes: {
    class: cn(badgeVariants({ variant: 'violet' }), 'px-1'),
  },
  suggestion: {
    char: TRIGGER_CHAR,
    items({ query }) {
      const { variableSuggestions } = monacoStore.getState();
      const normalized = query.toLowerCase();
      const entries = variableSuggestions.filter((label) =>
        label.toLowerCase().includes(normalized)
      );
      entries.push('$env.');
      return entries;
    },
    render() {
      let component: ReactRenderer<null, VariableListProps>;
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
