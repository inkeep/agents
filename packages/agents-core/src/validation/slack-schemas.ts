//agents-core/src/validation/slack-schemas.ts
import { z } from 'zod';

// ============================================================
// Slack Workspace
// ============================================================
export const SlackWorkspaceInsertSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  teamDomain: z.string().nullable().optional(),
  installedBy: z.string().min(1),
  botUserId: z.string().min(1),
  scopes: z.string().default(''),
  nangoConnectionId: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const SlackWorkspaceUpdateSchema = SlackWorkspaceInsertSchema.partial().omit({
  id: true,
  tenantId: true,
  projectId: true,
});

export type SlackWorkspaceInsert = z.infer<typeof SlackWorkspaceInsertSchema>;
export type SlackWorkspaceUpdate = z.infer<typeof SlackWorkspaceUpdateSchema>;

// ============================================================
// Slack Channel
// ============================================================
export const SlackChannelInsertSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
  channelName: z.string().min(1),
  channelType: z.string().min(1),
  isEnabled: z.boolean().default(true),
  respondToMentions: z.boolean().default(true),
  respondToDirectMessages: z.boolean().default(true),
  respondToThreads: z.boolean().default(true),
  agentId: z.string().nullable().optional(),
});

export const SlackChannelUpdateSchema = SlackChannelInsertSchema.partial().omit({
  id: true,
  tenantId: true,
  projectId: true,
});

export type SlackChannelInsert = z.infer<typeof SlackChannelInsertSchema>;
export type SlackChannelUpdate = z.infer<typeof SlackChannelUpdateSchema>;

// ============================================================
// Slack User Mapping
// ============================================================
export const SlackUserMappingInsertSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  slackUserId: z.string().min(1),
  slackUserName: z.string().nullable().optional(),
  slackEmail: z.string().email().nullable().optional(),
  internalUserId: z.string().nullable().optional(),
  nangoUserConnectionId: z.string().nullable().optional(),
});

export const SlackUserMappingUpdateSchema = SlackUserMappingInsertSchema.partial().omit({
  id: true,
  tenantId: true,
});

export type SlackUserMappingInsert = z.infer<typeof SlackUserMappingInsertSchema>;
export type SlackUserMappingUpdate = z.infer<typeof SlackUserMappingUpdateSchema>;
