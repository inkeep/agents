import { Info } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FieldLabelProps {
  id?: string;
  label: ReactNode;
  isRequired?: boolean;
  tooltip?: string;
  error?: string;
  className?: string;
}

export const FieldLabel: FC<FieldLabelProps> = ({
  id,
  label,
  isRequired,
  tooltip,
  error,
  className,
}) => {
  return (
    <Label htmlFor={id} className={cn('gap-1', error && 'text-red-600', className)}>
      {label}
      {isRequired && <span className="text-red-500">*</span>}
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-3 h-3 text-muted-foreground ml-1" />
            </TooltipTrigger>
            <TooltipContent className="wrap-break-word">{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
  );
};
