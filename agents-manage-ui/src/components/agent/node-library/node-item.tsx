import { GripVertical, type LucideIcon } from 'lucide-react';
import type { ComponentProps, FC, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type NodeItem = {
  type: string;
  name: string;
  Icon: LucideIcon;
  disabled?: boolean;
  disabledTooltip?: ReactNode;
};

interface NodeItemProps {
  node: NodeItem;
}

const onDragStart: ComponentProps<'button'>['onDragStart'] = (event) => {
  const type = event.currentTarget.dataset.nodeType;
  // Only store the minimal serializable data required by the drop handler.
  // `node` can include React elements (e.g. disabledTooltip) which are not JSON-serializable in dev builds.
  event.dataTransfer.setData('application/reactflow', JSON.stringify({ type }));
  event.dataTransfer.effectAllowed = 'move';
};

export const NodeItem: FC<NodeItemProps> = ({ node }) => {
  'use memo';
  const { type, name, Icon, disabled, disabledTooltip } = node;
  const content = (
    <button
      key={type}
      type="button"
      data-node-type={type}
      tabIndex={disabled ? -1 : 0}
      aria-label={`Drag ${name} node`}
      className={[
        'backdrop-blur-3xl border bg-background shadow-xs',
        'dark:bg-input/30 dark:border-input',
        'flex font-medium items-center text-sm rounded-md p-2 justify-between gap-2 text-left h-auto w-full',
        'group group-hover:bg-muted/50 transition-all ease-in-out duration-200',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-input/50 cursor-grab active:cursor-grabbing',
      ].join(' ')}
      draggable={!disabled}
      onDragStart={onDragStart}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-col items-start min-w-0">
          <span className="truncate w-full inline-block">{name}</span>
        </div>
      </div>
      <GripVertical className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-all ease-in-out duration-200" />
    </button>
  );

  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {disabledTooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
};
