'use client';

import { Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UNKNOWN_VALUE } from '@/constants/signoz';
import type { ConversationDetail } from './timeline/types';
import { ACTIVITY_STATUS } from './timeline/types';

interface MCPBreakdownCardProps {
  conversation: ConversationDetail;
}

interface ToolCallInfo {
  toolName: string;
  mcpServer: string;
  successCount: number;
  failureCount: number;
}

export function MCPBreakdownCard({ conversation }: MCPBreakdownCardProps) {
  const mcpStats = useMemo(() => {
    const activities = conversation.activities || [];

    // Filter for MCP tool calls only
    const mcpToolCalls = activities.filter(
      (activity) =>
        activity.type === 'tool_call' &&
        activity.toolType === 'mcp' &&
        activity.toolName !== 'thinking_complete'
    );

    // Group by MCP server and tool
    const serverToolMap = new Map<string, Map<string, { successes: number; failures: number }>>();

    for (const activity of mcpToolCalls) {
      const serverName = activity.mcpServerName || UNKNOWN_VALUE;
      const toolName = activity.toolName || 'Unknown Tool';
      const hasError =
        activity.status === ACTIVITY_STATUS.ERROR || activity.status === ACTIVITY_STATUS.WARNING;

      let toolMap = serverToolMap.get(serverName);
      if (!toolMap) {
        toolMap = new Map();
        serverToolMap.set(serverName, toolMap);
      }

      let toolStats = toolMap.get(toolName);
      if (!toolStats) {
        toolStats = { successes: 0, failures: 0 };
        toolMap.set(toolName, toolStats);
      }

      if (hasError) {
        toolStats.failures += 1;
      } else {
        toolStats.successes += 1;
      }
    }

    // Convert to array structure
    const servers: Array<{
      serverName: string;
      tools: ToolCallInfo[];
    }> = [];

    for (const [serverName, toolMap] of serverToolMap.entries()) {
      const tools: ToolCallInfo[] = [];
      for (const [toolName, stats] of toolMap.entries()) {
        tools.push({
          toolName,
          mcpServer: serverName,
          successCount: stats.successes,
          failureCount: stats.failures,
        });
      }
      // Sort tools by total calls (successes + failures) descending
      tools.sort((a, b) => b.successCount + b.failureCount - (a.successCount + a.failureCount));
      servers.push({ serverName, tools });
    }

    // Sort servers alphabetically
    servers.sort((a, b) => {
      if (a.serverName === UNKNOWN_VALUE) return 1;
      if (b.serverName === UNKNOWN_VALUE) return -1;
      return a.serverName.localeCompare(b.serverName);
    });

    const totalCalls = mcpToolCalls.length;

    return {
      servers,
      totalCalls,
    };
  }, [conversation]);

  return (
    <Card className="shadow-none bg-background flex flex-col max-h-[280px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
        <CardTitle className="text-sm font-medium text-foreground"> MCP Tool Calls</CardTitle>
        <Wrench className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full">
          {mcpStats.totalCalls === 0 ? (
            <div className="text-sm text-muted-foreground px-3 py-2">0 MCP tool calls</div>
          ) : (
            <div className="space-y-3 h-full overflow-y-auto pr-1">
              {mcpStats.servers.map((server) => (
                <div key={server.serverName} className="space-y-1">
                  {/* Server Name Header */}
                  <div className="text-sm font-medium text-foreground px-3 py-1">
                    {server.serverName === UNKNOWN_VALUE ? 'Unknown Server' : server.serverName}
                  </div>

                  {/* Tools */}
                  {server.tools.map((tool) => {
                    const hasSuccess = tool.successCount > 0;
                    const hasFailures = tool.failureCount > 0;

                    return (
                      <div
                        key={`${server.serverName}-${tool.toolName}`}
                        className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-xs text-foreground truncate flex-1">
                          {tool.toolName}
                        </span>
                        <div className="flex items-center gap-2">
                          {hasSuccess && (
                            <span className="text-xs font-medium text-green-600 dark:text-green-500">
                              {tool.successCount}×
                            </span>
                          )}
                          {hasFailures && (
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">
                              {tool.failureCount}×
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
