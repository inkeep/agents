import { z } from '@hono/zod-openapi';

// =============================================================================
// REUSABLE SUB-SCHEMAS
// =============================================================================

export const SlackTeamSchema = z.object({
  id: z.string().optional(),
});

export const SlackChannelSchema = z.object({
  id: z.string().optional(),
});

export const SlackUserSchema = z.object({
  id: z.string().optional(),
});

export const SlackMessageSchema = z.object({
  ts: z.string().optional(),
  text: z.string().optional(),
  thread_ts: z.string().optional(),
});

export const SlackActionSchema = z.object({
  action_id: z.string(),
  value: z.string().optional(),
  selected_option: z.object({ value: z.string().optional() }).optional(),
});

export const SlackViewSchema = z.object({
  id: z.string().optional(),
  callback_id: z.string().optional(),
  private_metadata: z.string().optional(),
  state: z.object({ values: z.record(z.string(), z.record(z.string(), z.unknown())) }).optional(),
});

// =============================================================================
// SUB-SCHEMA TYPE EXPORTS
// =============================================================================

export type SlackTeam = z.infer<typeof SlackTeamSchema>;
export type SlackChannel = z.infer<typeof SlackChannelSchema>;
export type SlackUser = z.infer<typeof SlackUserSchema>;
export type SlackMessage = z.infer<typeof SlackMessageSchema>;
export type SlackAction = z.infer<typeof SlackActionSchema>;
export type SlackView = z.infer<typeof SlackViewSchema>;

// =============================================================================
// TOP-LEVEL EVENT SCHEMAS
// =============================================================================

export const UrlVerificationEventSchema = z.object({
  type: z.literal('url_verification'),
  challenge: z.string(),
});

const BaseInnerEventSchema = z
  .object({
    type: z.string(),
    user: z.string().optional(),
    channel: z.string().optional(),
    bot_id: z.string().optional(),
    subtype: z.string().optional(),
  })
  .passthrough();

export const EventCallbackSchema = z.object({
  type: z.literal('event_callback'),
  team_id: z.string().optional(),
  event: BaseInnerEventSchema.optional(),
});

const BlockActionsBaseSchema = z.object({
  actions: z.array(SlackActionSchema).optional(),
  team: SlackTeamSchema.optional(),
  view: SlackViewSchema.optional(),
  response_url: z.string().optional(),
  trigger_id: z.string().optional(),
});

export const BlockActionsEventSchema = BlockActionsBaseSchema.extend({
  type: z.literal('block_actions'),
});

export const InteractiveMessageEventSchema = BlockActionsBaseSchema.extend({
  type: z.literal('interactive_message'),
});

export const MessageActionEventSchema = z.object({
  type: z.literal('message_action'),
  callback_id: z.string().optional(),
  trigger_id: z.string().optional(),
  response_url: z.string().optional(),
  team: SlackTeamSchema.optional(),
  channel: SlackChannelSchema.optional(),
  user: SlackUserSchema.optional(),
  message: SlackMessageSchema.optional(),
});

export const ViewSubmissionEventSchema = z.object({
  type: z.literal('view_submission'),
  view: SlackViewSchema.optional(),
});

// =============================================================================
// DISCRIMINATED UNION
// =============================================================================

export const SlackEventSchema = z.discriminatedUnion('type', [
  UrlVerificationEventSchema,
  EventCallbackSchema,
  BlockActionsEventSchema,
  InteractiveMessageEventSchema,
  MessageActionEventSchema,
  ViewSubmissionEventSchema,
]);

// =============================================================================
// INNER EVENT SCHEMAS (for event_callback dispatch)
// =============================================================================

export const AppMentionInnerSchema = z.object({
  type: z.literal('app_mention'),
  user: z.string(),
  channel: z.string(),
  text: z.string().optional(),
  ts: z.string().optional(),
  thread_ts: z.string().optional(),
  bot_id: z.string().optional(),
  subtype: z.string().optional(),
});

export const KnownInnerEventSchema = z.discriminatedUnion('type', [AppMentionInnerSchema]);

// =============================================================================
// TOP-LEVEL EVENT TYPE EXPORTS
// =============================================================================

export type UrlVerificationEvent = z.infer<typeof UrlVerificationEventSchema>;
export type EventCallbackEvent = z.infer<typeof EventCallbackSchema>;
export type BlockActionsEvent = z.infer<typeof BlockActionsEventSchema>;
export type InteractiveMessageEvent = z.infer<typeof InteractiveMessageEventSchema>;
export type MessageActionEvent = z.infer<typeof MessageActionEventSchema>;
export type ViewSubmissionEvent = z.infer<typeof ViewSubmissionEventSchema>;
export type SlackEvent = z.infer<typeof SlackEventSchema>;

export type BaseInnerEvent = z.infer<typeof BaseInnerEventSchema>;
export type AppMentionInnerEvent = z.infer<typeof AppMentionInnerSchema>;
export type KnownInnerEvent = z.infer<typeof KnownInnerEventSchema>;
