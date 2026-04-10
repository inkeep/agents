import type { ComponentProps, FC, HTMLAttributes, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { cn } from '@/lib/utils';
import { NodeTab } from './node-tab';

interface BaseNodeProps extends HTMLAttributes<HTMLDivElement> {
  isSelected?: boolean;
}

export const BaseNode: FC<BaseNodeProps> = ({ className, isSelected, children, ...props }) => {
  const { tabs, restChildren } = Children.toArray(children).reduce<{
    tabs: ReactNode[];
    restChildren: ReactNode[];
  }>(
    (acc, child) => {
      if (isValidElement(child) && child.type === NodeTab) {
        acc.tabs.push(child);
      } else {
        acc.restChildren.push(child);
      }
      return acc;
    },
    { tabs: [], restChildren: [] }
  );

  return (
    <>
      {tabs}
      <div
        className={cn(
          'relative rounded-lg border bg-card text-card-foreground',
          // React Flow displays node elements inside a `NodeWrapper` component,
          // which compiles down to a div with a class `react-flow__node`.
          // When a node is selected, the class `selected` is added to the
          // `react-flow__node` element. This allows us to style the node when it
          isSelected && 'ring-2 ring-primary',
          className
        )}
        {...props}
      >
        {restChildren}
      </div>
    </>
  );
};

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNode />` component.
 */
export const BaseNodeHeader: FC<ComponentProps<'header'>> = ({ className, ...props }) => (
  <header
    {...props}
    className={cn(
      'mx-0 my-0 -mb-1 flex flex-row items-center justify-between gap-2 px-4 pt-4 pb-0',
      // Remove or modify these classes if you modify the padding in the
      // `<BaseNode />` component.
      className
    )}
  />
);

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export const BaseNodeHeaderTitle: FC<ComponentProps<'h3'>> = ({ className, ...props }) => (
  <h3
    data-slot="base-node-title"
    className={cn('user-select-none flex-1 font-semibold text-sm truncate', className)}
    {...props}
  />
);

export const BaseNodeContent: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
  <div
    data-slot="base-node-content"
    className={cn('flex flex-col gap-y-2 p-4 text-foreground break-words', className)}
    {...props}
  />
);
