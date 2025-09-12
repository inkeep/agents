import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BaseNodeProps extends HTMLAttributes<HTMLDivElement> {
  isSelected?: boolean;
}

export const BaseNode = forwardRef<HTMLDivElement, BaseNodeProps>(
  ({ className, isSelected, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-lg border bg-card text-card-foreground',
        'hover:ring-2 hover:ring-gray-700/5',
        // React Flow displays node elements inside of a `NodeWrapper` component,
        // which compiles down to a div with a the class `react-flow__node`.
        // When a node is selected, the class `selected` is added to the
        // `react-flow__node` element. This allows us to style the node when it
        isSelected && 'ring-2 ring-primary hover:ring-primary',
        className
      )}
      // tabIndex={0}
      {...props}
    />
  )
);
BaseNode.displayName = 'BaseNode';

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNode />` component.
 */
export const BaseNodeHeader = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <header
      ref={ref}
      {...props}
      className={cn(
        'mx-0 my-0 -mb-1 flex flex-row items-center justify-between gap-2 px-4 pt-4 pb-0',
        // Remove or modify these classes if you modify the padding in the
        // `<BaseNode />` component.
        className
      )}
    />
  )
);
BaseNodeHeader.displayName = 'BaseNodeHeader';

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export const BaseNodeHeaderTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    data-slot="base-node-title"
    className={cn('user-select-none flex-1 font-semibold text-sm truncate', className)}
    {...props}
  />
));
BaseNodeHeaderTitle.displayName = 'BaseNodeHeaderTitle';

export const BaseNodeContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="base-node-content"
      className={cn('flex flex-col gap-y-2 p-4 text-foreground', className)}
      {...props}
    />
  )
);
BaseNodeContent.displayName = 'BaseNodeContent';

export const BaseNodeFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="base-node-footer"
      className={cn('flex flex-col items-center gap-y-2 border-t px-4 pb-4 pt-3', className)}
      {...props}
    />
  )
);
BaseNodeFooter.displayName = 'BaseNodeFooter';
