'use client';

import type { ReactNode } from 'react';
import { MCPIcon } from '@/components/icons/mcp-icon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UNKNOWN_VALUE } from '@/constants/signoz';
import { ServerGroup } from './server-group';

type ToolCallEntry = {
  toolName: string;
  serverName: string;
  serverId: string;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
};

type ToolCallsByServerCardProps = {
  title: string;
  loading: boolean;
  toolCalls: ToolCallEntry[];
  selectedServer?: string;
  selectedTool?: string;
  emptyMessageAll?: string;
  emptyMessageFiltered?: string;
};

function sortServerNames(serverNames: string[]): string[] {
  return [...serverNames].sort((a, b) => {
    if (a === UNKNOWN_VALUE) return 1;
    if (b === UNKNOWN_VALUE) return -1;
    return a.localeCompare(b);
  });
}

function groupToolsByServer(toolCalls: ToolCallEntry[]) {
  return toolCalls.reduce(
    (acc, tool) => {
      const serverName = tool.serverName || UNKNOWN_VALUE;
      if (!acc[serverName]) acc[serverName] = [];
      acc[serverName].push(tool);
      return acc;
    },
    {} as Record<string, ToolCallEntry[]>
  );
}

function ServerItemSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card dark:bg-muted/30">
      <div className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
        <Skeleton className="h-4 flex-1 max-w-[200px]" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="space-y-2 border-t border-border px-4 py-2">
        <Skeleton className="h-8 w-56 rounded-md" />
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
    </div>
  );
}

export function ToolCallsByServerCard({
  title,
  loading,
  toolCalls,
  selectedServer = 'all',
  selectedTool = 'all',
  emptyMessageAll = 'No MCP tool calls detected in the selected time range.',
  emptyMessageFiltered = 'No tool calls found for the selected server.',
}: ToolCallsByServerCardProps) {
  const toolsByServer = groupToolsByServer(toolCalls);
  const serverNames = sortServerNames(
    Object.keys(toolsByServer).filter((name) => selectedServer === 'all' || name === selectedServer)
  );

  let content: ReactNode;

  if (loading) {
    content = (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <ServerItemSkeleton key={i} />
        ))}
      </div>
    );
  } else if (serverNames.length === 0) {
    const emptyMessage = selectedServer === 'all' ? emptyMessageAll : emptyMessageFiltered;
    content = (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No tool calls found.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{emptyMessage}</p>
      </div>
    );
  } else {
    content = (
      <div className="space-y-4">
        {serverNames.map((serverName) => {
          const serverTools = toolsByServer[serverName];
          const serverTotalCalls = serverTools.reduce((sum, t) => sum + t.totalCalls, 0);
          const serverTotalErrors = serverTools.reduce((sum, t) => sum + t.errorCount, 0);
          const serverSuccessful = serverTotalCalls - serverTotalErrors;
          const serverId = serverTools[0]?.serverId;
          const toolsToShow = serverTools
            .filter((tool) => selectedTool === 'all' || tool.toolName === selectedTool)
            .sort((a, b) => b.totalCalls - a.totalCalls);

          return (
            <ServerGroup
              key={serverName}
              name={serverName === UNKNOWN_VALUE ? 'Unknown Server' : serverName}
              slug={serverId ?? ''}
              toolCount={serverTools.length}
              totalSuccess={serverSuccessful}
              totalCalls={serverTotalCalls}
              tools={toolsToShow.map((tool) => ({
                name: tool.toolName === UNKNOWN_VALUE ? 'Unknown Tool' : tool.toolName,
                successCount: tool.totalCalls - tool.errorCount,
                totalCalls: tool.totalCalls,
              }))}
            />
          );
        })}
      </div>
    );
  }

  return (
    <Card className="shadow-none bg-background">
      <CardHeader>
        <CardTitle className="flex font-medium items-center gap-4 text-foreground">
          <div className="flex items-center gap-2">
            <MCPIcon className="h-4 w-4 text-gray-400 dark:text-white/40" />
            {title}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent dark:scrollbar-thumb-muted-foreground/50 max-h-[600px] overflow-y-auto">
        {content}
      </CardContent>
    </Card>
  );
}
