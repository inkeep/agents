import { Info } from 'lucide-react';
import type { FC } from 'react';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FieldLabelProps {
  id: string;
  label: string;
  isRequired?: boolean;
  tooltip?: string;
  error?: string;
}

export const FieldLabel: FC<FieldLabelProps> = ({ id, label, isRequired, tooltip, error }) => {
  return (
    <Label htmlFor={id} className={cn(error && 'text-red-600', 'gap-1')}>
      {label}
      {isRequired && <span className="text-red-500">*</span>}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger>
            <Info className="w-3 h-3 text-muted-foreground ml-1" />
          </TooltipTrigger>
          <TooltipContent className="wrap-break-word">{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </Label>
  );
};
