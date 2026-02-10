'use client';

import { ChevronDown, Server } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ToolCallItem } from './tool-call-item';

interface Tool {
  name: string;
  successCount: number;
  totalCalls: number;
}

interface ServerGroupProps {
  name: string;
  slug: string;
  toolCount: number;
  tools: Tool[];
  /** When set, server header shows these instead of aggregating from tools (e.g. when tools are filtered). */
  totalSuccess?: number;
  totalCalls?: number;
}

export function ServerGroup({
  name,
  slug,
  toolCount,
  tools,
  totalSuccess: totalSuccessProp,
  totalCalls: totalCallsProp,
}: ServerGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  const fromTools = {
    totalSuccess: tools.reduce((sum, t) => sum + t.successCount, 0),
    totalCalls: tools.reduce((sum, t) => sum + t.totalCalls, 0),
  };
  const totalSuccess = totalSuccessProp ?? fromTools.totalSuccess;
  const totalCalls = totalCallsProp ?? fromTools.totalCalls;
  const rate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0;

  const status = rate === 0 ? 'destructive' : rate < 50 ? 'warning' : 'success';

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Server className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{slug}</span>
            <span className="text-border">{'/'}</span>
            <span>{toolCount} tools</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums font-mono',
              status === 'success' && 'text-(--success)',
              status === 'warning' && 'text-(--warning)',
              status === 'destructive' && 'text-destructive'
            )}
          >
            {rate}%
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalSuccess}/{totalCalls} calls
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border px-1 py-1">
          {tools.map((tool) => (
            <ToolCallItem
              key={tool.name}
              name={tool.name}
              successCount={tool.successCount}
              totalCalls={tool.totalCalls}
            />
          ))}
        </div>
      )}
    </div>
  );
}
