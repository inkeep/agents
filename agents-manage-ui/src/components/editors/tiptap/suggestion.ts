import { autoUpdate, computePosition, flip, type ReferenceElement, shift } from '@floating-ui/dom';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import type { MentionOptions } from '@tiptap/extension-mention';
import { buildVariableItems, VariableList } from './variable-list';

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

export const suggestion: MentionOptions['suggestion'] = {
  char: '{',
  items: buildVariableItems,

  render() {
    let component: ReactRenderer;
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
        const el = component.element;

        if (!props.clientRect) {
          return;
        }

        el.style.position = 'absolute';

        document.body.appendChild(el);

        // Keep the menu positioned when the editable area scrolls.
        updatePosition(virtualElement, el);
        cleanup = autoUpdate(virtualElement, el, () => updatePosition(virtualElement, el), {
          // With a virtual reference, rely on animation frames so scrolling
          // inside the editor keeps the list aligned.
          animationFrame: true,
        });
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
};
