import { GripVertical, type LucideIcon } from 'lucide-react';

export type NodeItem = {
  type: string;
  name: string;
  Icon: LucideIcon;
  disabled?: boolean;
};

interface NodeItemProps {
  node: NodeItem;
}

export function NodeItem({ node }: NodeItemProps) {
  const { type, name, Icon, disabled } = node;
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, node: NodeItem) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(node));
    event.dataTransfer.effectAllowed = 'move';
  };
  return (
    <div
      key={type}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Drag ${name} node`}
      className="border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 flex font-medium items-center text-sm rounded-md p-2 justify-between gap-2 text-left h-auto w-full group group-hover:bg-muted/50 transition-all ease-in-out duration-200 cursor-grab active:cursor-grabbing"
      draggable={!disabled}
      onDragStart={(e) => onDragStart(e, node)}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-col items-start min-w-0">
          <span className="truncate w-full inline-block">{name}</span>
        </div>
      </div>
      <GripVertical className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-all ease-in-out duration-200" />
    </div>
  );
}
