import { eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { workAppSlackMcpToolAccessConfig } from '../../db/runtime/runtime-schema';
import type { McpTool, ToolSelect } from '../../types/entities';

export type SlackMcpToolAccessConfig = {
  channelAccessMode: 'all' | 'selected';
  dmEnabled: boolean;
  channelIds: string[];
};

export const getSlackMcpToolAccessConfig =
  (db: AgentsRunDatabaseClient) =>
  async (toolId: string): Promise<SlackMcpToolAccessConfig> => {
    const result = await db
      .select({
        channelAccessMode: workAppSlackMcpToolAccessConfig.channelAccessMode,
        dmEnabled: workAppSlackMcpToolAccessConfig.dmEnabled,
        channelIds: workAppSlackMcpToolAccessConfig.channelIds,
      })
      .from(workAppSlackMcpToolAccessConfig)
      .where(eq(workAppSlackMcpToolAccessConfig.toolId, toolId))
      .limit(1);

    return (
      result[0] ?? {
        channelAccessMode: 'selected' as const,
        dmEnabled: false,
        channelIds: [],
      }
    );
  };

export const setSlackMcpToolAccessConfig =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    toolId: string;
    tenantId: string;
    projectId: string;
    channelAccessMode: 'all' | 'selected';
    dmEnabled: boolean;
    channelIds: string[];
  }): Promise<void> => {
    const now = new Date().toISOString();

    await db
      .insert(workAppSlackMcpToolAccessConfig)
      .values({
        toolId: params.toolId,
        tenantId: params.tenantId,
        projectId: params.projectId,
        channelAccessMode: params.channelAccessMode,
        dmEnabled: params.dmEnabled,
        channelIds: params.channelIds,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [workAppSlackMcpToolAccessConfig.toolId],
        set: {
          channelAccessMode: params.channelAccessMode,
          dmEnabled: params.dmEnabled,
          channelIds: params.channelIds,
          updatedAt: now,
        },
      });
  };

export const isSlackWorkAppTool = (tool: ToolSelect | McpTool) => {
  return tool.isWorkApp && tool.config.mcp.server.url.includes('/slack/mcp');
};
