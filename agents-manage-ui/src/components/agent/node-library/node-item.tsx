import { GripVertical, type LucideIcon } from 'lucide-react';
import type { ComponentProps, FC, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    <Button
      variant="outline"
      key={type}
      type="button"
      data-node-type={type}
      tabIndex={disabled ? -1 : 0}
      aria-label={`Drag ${name} node`}
      className={cn(
        'backdrop-blur-3xl justify-start normal-case font-normal font-sans',
        'group group-hover:bg-muted/50 transition-all ease-in-out duration-200'
      )}
      draggable={!disabled}
      onDragStart={onDragStart}
    >
      <Icon className="text-muted-foreground" />
      {name}
      <GripVertical className="ml-auto text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-all ease-in-out duration-200" />
    </Button>
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
