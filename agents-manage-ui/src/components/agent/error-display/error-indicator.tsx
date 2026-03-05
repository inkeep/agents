'use client';

import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ErrorIndicatorProps {
  errors: { field: string; message?: string }[];
}

export function ErrorIndicator({ errors }: ErrorIndicatorProps) {
  if (!errors.length) return;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="error"
            className="rounded-full px-[.2em] absolute -top-2 -right-2 dark:bg-background"
          >
            <AlertCircle className="h-[1.1em]! w-auto!" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="text-wrap max-w-xs [--bg-color:var(--color-red-50)] dark:[--bg-color:var(--color-red-950)] border-red-200 dark:border-red-700 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/90"
        >
          <div className="space-y-1">
            <div className="font-medium">Validation Error{errors.length > 1 ? 's' : ''}</div>
            {errors.slice(0, 3).map((error, index) => (
              <div key={index} className="text-xs">
                <b>{error.field}</b>: {error.message}
              </div>
            ))}
            {errors.length > 3 && (
              <div className="text-xs text-red-600 dark:text-red-400">
                ...and {errors.length - 3} more error
                {errors.length - 3 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
