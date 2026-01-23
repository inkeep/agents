// @inkeep/agents-core/data-access/manage/slack

import { eq, and } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  slackWorkspaces,
  slackChannels,
  slackUserMappings,
} from '../../db/manage/slack-schema';
import type {
  SlackWorkspaceInsert,
  SlackWorkspaceUpdate,
  SlackChannelInsert,
  SlackChannelUpdate,
  SlackUserMappingInsert,
  SlackUserMappingUpdate,
} from '../../validation/slack-schemas';

// ============================================
// ID Generators
// ============================================
export function generateSlackWorkspaceId(): string {
  return `slackws_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateSlackChannelId(): string {
  return `slackch_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateSlackUserMappingId(): string {
  return `slackum_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ============================================
// Workspace Functions
// ============================================
export const getSlackWorkspaceById =
  (db: AgentsManageDatabaseClient) =>
    async (params: { tenantId: string; projectId: string; workspaceId: string }) => {
      return db.query.slackWorkspaces.findFirst({
        where: and(
          eq(slackWorkspaces.tenantId, params.tenantId),
          eq(slackWorkspaces.projectId, params.projectId),
          eq(slackWorkspaces.id, params.workspaceId)
        ),
        with: { channels: true },
      });
    };

/**
 * Get workspace by Slack team ID
 * This is the primary lookup for the authorize flow
 */
export const getSlackWorkspaceByTeamId =
  (db: AgentsManageDatabaseClient) =>
    async (params: { teamId: string }) => {
      return db.query.slackWorkspaces.findFirst({
        where: eq(slackWorkspaces.teamId, params.teamId),
        with: { channels: true },
      });
    };

/**
 * Get workspace by Nango connection ID
 * Useful for handling Nango webhooks
 */
export const getSlackWorkspaceByNangoConnectionId =
  (db: AgentsManageDatabaseClient) =>
    async (params: { nangoConnectionId: string }) => {
      return db.query.slackWorkspaces.findFirst({
        where: eq(slackWorkspaces.nangoConnectionId, params.nangoConnectionId),
      });
    };

export const listSlackWorkspaces =
  (db: AgentsManageDatabaseClient) =>
    async (params: { tenantId: string; projectId: string }) => {
      return db.query.slackWorkspaces.findMany({
        where: and(
          eq(slackWorkspaces.tenantId, params.tenantId),
          eq(slackWorkspaces.projectId, params.projectId)
        ),
        orderBy: (w, { desc }) => [desc(w.createdAt)],
      });
    };

export const createSlackWorkspace =
  (db: AgentsManageDatabaseClient) =>
    async (params: {
      tenantId: string;
      projectId: string;
      data: Omit<SlackWorkspaceInsert, 'tenantId' | 'projectId'>;
    }) => {
      const [result] = await db
        .insert(slackWorkspaces)
        .values({
          ...params.data,
          tenantId: params.tenantId,
          projectId: params.projectId,
        })
        .returning();
      return result;
    };

export const updateSlackWorkspace =
  (db: AgentsManageDatabaseClient) =>
    async (params: {
      tenantId: string;
      projectId: string;
      workspaceId: string;
      data: SlackWorkspaceUpdate;
    }) => {
      const [result] = await db
        .update(slackWorkspaces)
        .set({
          ...params.data,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(slackWorkspaces.tenantId, params.tenantId),
            eq(slackWorkspaces.projectId, params.projectId),
            eq(slackWorkspaces.id, params.workspaceId)
          )
        )
        .returning();
      return result;
    };

export const deleteSlackWorkspace =
  (db: AgentsManageDatabaseClient) =>
    async (params: { tenantId: string; projectId: string; workspaceId: string }) => {
      await db.delete(slackWorkspaces).where(
        and(
          eq(slackWorkspaces.tenantId, params.tenantId),
          eq(slackWorkspaces.projectId, params.projectId),
          eq(slackWorkspaces.id, params.workspaceId)
        )
      );
      return true;
    };

// ============================================
// Channel Functions
// ============================================
export const getSlackChannelById =
  (db: AgentsManageDatabaseClient) =>
    async (params: { tenantId: string; projectId: string; channelId: string }) => {
      return db.query.slackChannels.findFirst({
        where: and(
          eq(slackChannels.tenantId, params.tenantId),
          eq(slackChannels.projectId, params.projectId),
          eq(slackChannels.id, params.channelId)
        ),
        with: { workspace: true },
      });
    };

export const getSlackChannelBySlackId =
  (db: AgentsManageDatabaseClient) =>
    async (params: { workspaceId: string; slackChannelId: string }) => {
      return db.query.slackChannels.findFirst({
        where: and(
          eq(slackChannels.workspaceId, params.workspaceId),
          eq(slackChannels.channelId, params.slackChannelId)
        ),
      });
    };

export const listSlackChannels =
  (db: AgentsManageDatabaseClient) =>
    async (params: { tenantId: string; projectId: string; workspaceId?: string }) => {
      const conditions = [
        eq(slackChannels.tenantId, params.tenantId),
        eq(slackChannels.projectId, params.projectId),
      ];

      if (params.workspaceId) {
        conditions.push(eq(slackChannels.workspaceId, params.workspaceId));
      }

      return db.query.slackChannels.findMany({
        where: and(...conditions),
        orderBy: (c, { asc }) => [asc(c.channelName)],
      });
    };

export const createSlackChannel =
  (db: AgentsManageDatabaseClient) =>
    async (params: {
      tenantId: string;
      projectId: string;
      data: Omit<SlackChannelInsert, 'tenantId' | 'projectId'>;
    }) => {
      const [result] = await db
        .insert(slackChannels)
        .values({
          ...params.data,
          tenantId: params.tenantId,
          projectId: params.projectId,
        })
        .returning();
      return result;
    };

export const updateSlackChannel =
  (db: AgentsManageDatabaseClient) =>
    async (params: {
      tenantId: string;
      projectId: string;
      channelId: string;
      data: SlackChannelUpdate;
    }) => {
      const [result] = await db
        .update(slackChannels)
        .set({
          ...params.data,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(slackChannels.tenantId, params.tenantId),
            eq(slackChannels.projectId, params.projectId),
            eq(slackChannels.id, params.channelId)
          )
        )
        .returning();
      return result;
    };

// ============================================
// User Mapping Functions
// ============================================
export const getSlackUserMapping =
  (db: AgentsManageDatabaseClient) =>
    async (params: { workspaceId: string; slackUserId: string }) => {
      return db.query.slackUserMappings.findFirst({
        where: and(
          eq(slackUserMappings.workspaceId, params.workspaceId),
          eq(slackUserMappings.slackUserId, params.slackUserId)
        ),
      });
    };

export const createSlackUserMapping =
  (db: AgentsManageDatabaseClient) =>
    async (params: {
      tenantId: string;
      data: Omit<SlackUserMappingInsert, 'tenantId'>;
    }) => {
      const [result] = await db
        .insert(slackUserMappings)
        .values({
          ...params.data,
          tenantId: params.tenantId,
        })
        .returning();
      return result;
    };

export const updateSlackUserMapping =
  (db: AgentsManageDatabaseClient) =>
    async (params: { id: string; data: SlackUserMappingUpdate }) => {
      const [result] = await db
        .update(slackUserMappings)
        .set({
          ...params.data,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(slackUserMappings.id, params.id))
        .returning();
      return result;
    };
