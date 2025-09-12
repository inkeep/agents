'use client';

import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProcessedGraphError } from '@/lib/utils/graph-error-parser';

interface ErrorIndicatorProps {
  errors: ProcessedGraphError[];
  className?: string;
}

export function ErrorIndicator({ errors, className = '' }: ErrorIndicatorProps) {
  if (errors.length === 0) return null;

  // For tooltip display, we'll show individual errors in the tooltip content

  const indicator = (
    <div
      className={`backdrop-blur-sm flex items-center justify-center bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-700 rounded-full ${className}`}
    >
      <AlertCircle className="text-red-600 dark:text-red-400 w-3 h-3" />
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs [--bg-color:var(--color-red-50)] dark:[--bg-color:var(--color-red-950)] border-red-200 dark:border-red-700 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/90"
        >
          <div className="space-y-1">
            <div className="font-medium">Validation Error{errors.length > 1 ? 's' : ''}</div>
            {errors.slice(0, 3).map((error, index) => (
              <div key={index} className="text-xs">
                <span className="font-medium">{error.field}:</span> {error.message}
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
