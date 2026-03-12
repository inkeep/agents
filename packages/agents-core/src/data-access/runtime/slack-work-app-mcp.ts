import { and, eq } from 'drizzle-orm';
import type { ToolScopeConfig } from '../../db/manage/scope-definitions';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  workAppSlackMcpToolAccessConfig,
  workAppSlackUserMappings,
} from '../../db/runtime/runtime-schema';
import type { McpTool, ToolSelect } from '../../types/entities';
import { getMcpServerUrl } from '../../types/utility';

export type SlackMcpToolAccessConfig = {
  channelAccessMode: 'all' | 'selected';
  dmEnabled: boolean;
  channelIds: string[];
};

export const getSlackMcpToolAccessConfig =
  (db: AgentsRunDatabaseClient) =>
  async (scope: ToolScopeConfig): Promise<SlackMcpToolAccessConfig> => {
    const result = await db
      .select({
        channelAccessMode: workAppSlackMcpToolAccessConfig.channelAccessMode,
        dmEnabled: workAppSlackMcpToolAccessConfig.dmEnabled,
        channelIds: workAppSlackMcpToolAccessConfig.channelIds,
      })
      .from(workAppSlackMcpToolAccessConfig)
      .where(
        and(
          eq(workAppSlackMcpToolAccessConfig.tenantId, scope.tenantId),
          eq(workAppSlackMcpToolAccessConfig.projectId, scope.projectId),
          eq(workAppSlackMcpToolAccessConfig.toolId, scope.toolId)
        )
      )
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
        target: [
          workAppSlackMcpToolAccessConfig.tenantId,
          workAppSlackMcpToolAccessConfig.projectId,
          workAppSlackMcpToolAccessConfig.toolId,
        ],
        set: {
          channelAccessMode: params.channelAccessMode,
          dmEnabled: params.dmEnabled,
          channelIds: params.channelIds,
          updatedAt: now,
        },
      });
  };

export const updateSlackMcpToolAccessChannelIds =
  (db: AgentsRunDatabaseClient) =>
  async (scope: ToolScopeConfig, channelIds: string[]): Promise<void> => {
    await db
      .update(workAppSlackMcpToolAccessConfig)
      .set({
        channelIds,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(workAppSlackMcpToolAccessConfig.tenantId, scope.tenantId),
          eq(workAppSlackMcpToolAccessConfig.projectId, scope.projectId),
          eq(workAppSlackMcpToolAccessConfig.toolId, scope.toolId)
        )
      );
  };

export const deleteSlackMcpToolAccessConfig =
  (db: AgentsRunDatabaseClient) =>
  async (scope: ToolScopeConfig): Promise<boolean> => {
    const result = await db
      .delete(workAppSlackMcpToolAccessConfig)
      .where(
        and(
          eq(workAppSlackMcpToolAccessConfig.tenantId, scope.tenantId),
          eq(workAppSlackMcpToolAccessConfig.projectId, scope.projectId),
          eq(workAppSlackMcpToolAccessConfig.toolId, scope.toolId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAllSlackMcpToolAccessConfigsByTenant =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string): Promise<number> => {
    const result = await db
      .delete(workAppSlackMcpToolAccessConfig)
      .where(eq(workAppSlackMcpToolAccessConfig.tenantId, tenantId))
      .returning();

    return result.length;
  };

export const isSlackWorkAppTool = (tool: ToolSelect | McpTool) => {
  return (
    tool.isWorkApp && (getMcpServerUrl(tool.config.mcp.server)?.includes('/slack/mcp') ?? false)
  );
};

export const resolveSlackUserContext =
  (db: AgentsRunDatabaseClient) =>
  async (inkeepUserId: string): Promise<string | undefined> => {
    const mappings = await db
      .select({
        slackUserId: workAppSlackUserMappings.slackUserId,
        slackUsername: workAppSlackUserMappings.slackUsername,
      })
      .from(workAppSlackUserMappings)
      .where(eq(workAppSlackUserMappings.inkeepUserId, inkeepUserId))
      .limit(1);

    if (mappings.length === 0) return undefined;

    const mapping = mappings[0];
    const parts = [`The current user's Slack user ID is ${mapping.slackUserId}.`];
    if (mapping.slackUsername) {
      parts.push(`Their Slack username is @${mapping.slackUsername}.`);
    }
    return parts.join(' ');
  };
