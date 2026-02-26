'use client';

import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ErrorIndicatorProps {
  errors: { field: string; message?: string }[];
}

export function ErrorIndicator({ errors }: ErrorIndicatorProps) {
  if (errors.length === 0) return;

  // For tooltip display, we'll show individual errors in the tooltip content
  const indicator = (
    <div
      className={cn(
        `backdrop-blur-sm bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-700 rounded-full`,
        'absolute -top-2 -right-2 p-[.2em]'
      )}
    >
      <AlertCircle className="text-red-600 dark:text-red-400 h-[.7em]! w-auto!" />
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
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
