import { autoUpdate, computePosition, flip, type ReferenceElement, shift } from '@floating-ui/dom';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import type { MentionOptions } from '@tiptap/extension-mention';
import { VariableList } from './variable-list';
import { MentionList } from './mention-list';

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
  items({ query }) {
    return [
      'Lea Thompson',
      'Cyndi Lauper',
      'Tom Cruise',
      'Madonna',
      'Jerry Hall',
      'Joan Collins',
      'Winona Ryder',
      'Christina Applegate',
      'Alyssa Milano',
      'Molly Ringwald',
      'Ally Sheedy',
      'Debbie Harry',
      'Olivia Newton-John',
      'Elton John',
      'Michael J. Fox',
      'Axl Rose',
      'Emilio Estevez',
      'Ralph Macchio',
      'Rob Lowe',
      'Jennifer Grey',
      'Mickey Rourke',
      'John Cusack',
      'Matthew Broderick',
      'Justine Bateman',
      'Lisa Bonet',
    ]
      .filter((item) => item.toLowerCase().startsWith(query.toLowerCase()))
      .slice(0, 5);
  },

  render() {
    let component: ReactRenderer;
    let cleanup: () => void;
    let virtualElement: ReferenceElement;

    return {
      onStart(props) {
        virtualElement = {
          getBoundingClientRect: () =>
            posToDOMRect(
              props.editor.view,
              props.editor.state.selection.from,
              props.editor.state.selection.to
            ),
          // Provide a DOM context so floating-ui can track scroll/resize ancestors.
          contextElement: props.editor.view.dom,
        };

        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        component.element.style.position = 'absolute';

        document.body.appendChild(component.element);

        // Keep the menu positioned when the editable area scrolls.
        updatePosition(virtualElement, component.element);
        cleanup = autoUpdate(
          virtualElement,
          component.element,
          () => updatePosition(virtualElement, component.element),
          {
            // With a virtual reference, rely on animation frames so scrolling
            // inside the editor keeps the list aligned.
            animationFrame: true,
          }
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

        return component.ref?.onKeyDown(props);
      },

      onExit() {
        cleanup?.();
        component.element.remove();
        component.destroy();
      },
    };
  },
};
