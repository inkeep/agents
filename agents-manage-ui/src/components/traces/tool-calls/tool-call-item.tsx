'use client';

import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCallItemProps {
  name: string;
  successCount: number;
  totalCalls: number;
}

function getStatusColor(rate: number) {
  if (rate === 0) return 'destructive';
  if (rate <= 50) return 'warning';
  return 'success';
}

export function ToolCallItem({ name, successCount, totalCalls }: ToolCallItemProps) {
  const rate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0;
  const status = getStatusColor(rate);

  return (
    <div className={cn('group flex items-center gap-3 rounded-lg px-3 py-2.5')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          status === 'success' &&
            'bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-(--success)',
          status === 'warning' &&
            'bg-[color-mix(in_oklch,var(--warning)_15%,transparent)] text-(--warning)',
          status === 'destructive' && 'bg-destructive/15 text-destructive'
        )}
      >
        <Wrench className="h-4 w-4" />
      </div>

      <span className="flex-1 truncate font-mono text-sm text-foreground/80 group-hover:text-foreground transition-colors">
        {name}
      </span>

      <div className="flex items-center gap-3 shrink-0">
        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              status === 'success' && 'bg-(--success)',
              status === 'warning' && 'bg-(--warning)',
              status === 'destructive' && 'bg-destructive'
            )}
            style={{ width: `${rate}%` }}
          />
        </div>

        <span
          className={cn(
            'text-sm font-semibold tabular-nums w-10 text-right font-mono',
            status === 'success' && 'text-(--success)',
            status === 'warning' && 'text-(--warning)',
            status === 'destructive' && 'text-destructive'
          )}
        >
          {rate}%
        </span>

        <span className="text-xs text-muted-foreground tabular-nums w-14 md:w-20 text-right">
          {successCount} / {totalCalls} calls
        </span>
      </div>
    </div>
  );
}
