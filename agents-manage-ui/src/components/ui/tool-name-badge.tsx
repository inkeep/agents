import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface ToolNameBadgeProps {
  toolName: string;
  className?: string;
  maxWidth?: string;
}

/**
 * A badge component for displaying tool names with truncation and tooltip.
 * Long tool names are truncated with ellipsis, and the full name is shown on hover.
 */
export function ToolNameBadge({ toolName, className, maxWidth = 'max-w-xs' }: ToolNameBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="code" className={cn('flex-1', maxWidth, className)}>
          <span className="truncate">{toolName}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-md font-mono text-xs break-all">{toolName}</TooltipContent>
    </Tooltip>
  );
}
