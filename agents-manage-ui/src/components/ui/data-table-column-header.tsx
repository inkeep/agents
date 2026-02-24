'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  align?: 'left' | 'right';
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  align = 'left',
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(align === 'right' && 'text-right', className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center gap-2', align === 'right' && 'justify-end', className)}>
      <Button
        variant="ghost"
        size="xs"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        <span>{title}</span>
        {column.getIsSorted() === 'desc' ? (
          <ArrowDown className="h-4 w-4" />
        ) : column.getIsSorted() === 'asc' ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowUpDown className="text-muted-foreground opacity-60 h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
