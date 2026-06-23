import type { WebhookEventType, WebhookSlackMeta } from './WebhookDeliveryService';

/** Slack Incoming Webhook URLs (chat.postMessage-compatible). */
export const SLACK_INCOMING_WEBHOOK_URL_PREFIX = 'https://hooks.slack.com/';

export function isSlackIncomingWebhookUrl(url: string): boolean {
  return url.startsWith(SLACK_INCOMING_WEBHOOK_URL_PREFIX);
}

export interface SlackContext {
  tenantId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  manageUiBaseUrl: string;
}

function buildProjectUrl(ctx: SlackContext): string {
  return `${ctx.manageUiBaseUrl}/${ctx.tenantId}/projects/${ctx.projectId}`;
}

function escapeSlackMrkdwn(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPropertyValue(v: unknown): string {
  const raw = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
  return raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
}

function formatPropertiesBlock(
  label: string,
  props: Record<string, unknown> | null | undefined
): { type: string; text: { type: string; text: string } } | null {
  if (!props || Object.keys(props).length === 0) return null;
  const lines = Object.entries(props)
    .slice(0, 8)
    .map(([k, v]) => `*${escapeSlackMrkdwn(k)}:* ${escapeSlackMrkdwn(formatPropertyValue(v))}`)
    .join('\n');
  const suffix = Object.keys(props).length > 8 ? `\n_+${Object.keys(props).length - 8} more_` : '';
  return { type: 'section', text: { type: 'mrkdwn', text: `*${label}*\n${lines}${suffix}` } };
}

function buildConversationSlack(
  data: Record<string, unknown>,
  eventType: WebhookEventType,
  ctx: SlackContext
): { text: string; blocks: unknown[] } {
  const conversation = data.conversation as Record<string, unknown> | undefined;
  const convId = conversation?.id as string | undefined;
  const title = (conversation?.title as string) || convId || 'Unknown';
  const isCreated = eventType === 'conversation.created';
  const header = isCreated ? 'New Conversation' : 'Conversation Updated';
  const text = `${header}: ${escapeSlackMrkdwn(title)}`;

  const baseProjectUrl = buildProjectUrl(ctx);
  const links: string[] = [];
  if (convId) {
    links.push(`<${baseProjectUrl}/traces/conversations/${convId}|View Conversation>`);
  }

  const userProps = conversation?.userProperties as Record<string, unknown> | null | undefined;
  const props = conversation?.properties as Record<string, unknown> | null | undefined;

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: header } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Conversation:*\n${escapeSlackMrkdwn(title)}` },
        { type: 'mrkdwn', text: `*Agent:*\n${escapeSlackMrkdwn(ctx.agentName)}` },
      ],
    },
  ];

  const userPropsBlock = formatPropertiesBlock('User Properties', userProps);
  if (userPropsBlock) blocks.push(userPropsBlock);
  const propsBlock = formatPropertiesBlock('Properties', props);
  if (propsBlock) blocks.push(propsBlock);

  if (links.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: links.join('  |  ') } });
  }

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Inkeep' }] });

  return { text, blocks };
}

function buildFeedbackSlack(
  data: Record<string, unknown>,
  ctx: SlackContext
): { text: string; blocks: unknown[] } {
  const feedback = data.feedback as Record<string, unknown> | undefined;
  const conversation = data.conversation as Record<string, unknown> | undefined;
  const feedbackType = (feedback?.type as string) || 'unknown';
  const details = feedback?.details as string | undefined;
  const convId = conversation?.id as string | undefined;
  const convTitle = (conversation?.title as string) || convId || 'Unknown';
  const emoji = feedbackType === 'positive' ? '+1' : '-1';

  const text = `Feedback received: ${escapeSlackMrkdwn(feedbackType)} on conversation ${escapeSlackMrkdwn(convTitle)}`;

  const baseProjectUrl = buildProjectUrl(ctx);
  const links: string[] = [];
  if (convId) {
    links.push(`<${baseProjectUrl}/traces/conversations/${convId}|View Conversation>`);
    links.push(`<${baseProjectUrl}/feedback?conversationId=${convId}|View Feedback>`);
  }

  const userProps = conversation?.userProperties as Record<string, unknown> | null | undefined;
  const props = conversation?.properties as Record<string, unknown> | null | undefined;

  const fields: Array<{ type: string; text: string }> = [
    { type: 'mrkdwn', text: `*Agent:*\n${escapeSlackMrkdwn(ctx.agentName)}` },
    { type: 'mrkdwn', text: `*Type:*\n:${emoji}: ${escapeSlackMrkdwn(feedbackType)}` },
    { type: 'mrkdwn', text: `*Conversation:*\n${escapeSlackMrkdwn(convTitle)}` },
  ];

  if (details) {
    const truncated = details.length > 200 ? `${details.slice(0, 197)}...` : details;
    fields.push({ type: 'mrkdwn', text: `*Details:*\n${escapeSlackMrkdwn(truncated)}` });
  }

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: 'Feedback Received' } },
    { type: 'section', fields },
  ];

  const userPropsBlock = formatPropertiesBlock('User Properties', userProps);
  if (userPropsBlock) blocks.push(userPropsBlock);
  const propsBlock = formatPropertiesBlock('Properties', props);
  if (propsBlock) blocks.push(propsBlock);

  if (links.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: links.join('  |  ') } });
  }

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Inkeep' }] });

  return { text, blocks };
}

function buildEventSlack(
  data: Record<string, unknown>,
  ctx: SlackContext
): { text: string; blocks: unknown[] } {
  const event = data.event as Record<string, unknown> | undefined;
  const eventType = (event?.type as string) || 'unknown';
  const eventId = (event?.id as string) || 'unknown';
  const convId = event?.conversationId as string | undefined;

  const text = `Event created: ${escapeSlackMrkdwn(eventType)} (${escapeSlackMrkdwn(eventId)})`;

  const baseProjectUrl = buildProjectUrl(ctx);
  const links: string[] = [];
  if (convId) {
    links.push(`<${baseProjectUrl}/traces/conversations/${convId}|View Conversation>`);
  }

  const userProps = event?.userProperties as Record<string, unknown> | null | undefined;
  const props = event?.properties as Record<string, unknown> | null | undefined;

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: 'Event Created' } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${escapeSlackMrkdwn(ctx.agentName)}` },
        { type: 'mrkdwn', text: `*Event Type:*\n${escapeSlackMrkdwn(eventType)}` },
        { type: 'mrkdwn', text: `*Event ID:*\n${escapeSlackMrkdwn(eventId)}` },
      ],
    },
  ];

  const userPropsBlock = formatPropertiesBlock('User Properties', userProps);
  if (userPropsBlock) blocks.push(userPropsBlock);
  const propsBlock = formatPropertiesBlock('Properties', props);
  if (propsBlock) blocks.push(propsBlock);

  if (links.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: links.join('  |  ') } });
  }

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Inkeep' }] });

  return { text, blocks };
}

function buildEvaluationFailedSlack(
  data: Record<string, unknown>,
  ctx: SlackContext,
  meta?: WebhookSlackMeta
): { text: string; blocks: unknown[] } {
  const evaluatorObj = data.evaluator as Record<string, unknown> | undefined;
  const conversationObj = data.conversation as Record<string, unknown> | undefined;
  const evaluatorName = (evaluatorObj?.name as string) || 'Unknown';
  const conversationId = (conversationObj?.id as string) || '';
  const failedConditions =
    (data.failedConditions as Array<{
      field: string;
      operator: string;
      value: number | boolean;
      actual: number | boolean;
    }>) ?? [];
  const evaluationRunConfigId = meta?.evaluationRunConfigId ?? null;
  const evaluationJobConfigId = meta?.evaluationJobConfigId ?? null;

  const scoreText =
    failedConditions.length > 0
      ? failedConditions
          .map(
            (c) =>
              `expected ${escapeSlackMrkdwn(c.field)} ${escapeSlackMrkdwn(c.operator)} ${c.value}, got ${c.actual}`
          )
          .join('; ')
      : 'failed pass criteria';

  const text = `Evaluation failed: ${escapeSlackMrkdwn(evaluatorName)} ${scoreText} on conversation ${escapeSlackMrkdwn(conversationId)}`;

  const conditionSections = failedConditions.flatMap((c) => [
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Field:*\n${escapeSlackMrkdwn(c.field)}` },
        { type: 'mrkdwn', text: `*Operator:*\n\`${c.operator}\`` },
        { type: 'mrkdwn', text: `*Expected:*\n${c.value}` },
        { type: 'mrkdwn', text: `*Actual:*\n${c.actual}` },
      ],
    },
  ]);

  const baseProjectUrl = buildProjectUrl(ctx);

  const links: string[] = [];
  if (conversationId) {
    links.push(`<${baseProjectUrl}/traces/conversations/${conversationId}|View Conversation>`);
  }

  if (evaluationRunConfigId) {
    links.push(
      `<${baseProjectUrl}/evaluations/run-configs/${evaluationRunConfigId}|View Evaluation>`
    );
  } else if (evaluationJobConfigId) {
    links.push(`<${baseProjectUrl}/evaluations/jobs/${evaluationJobConfigId}|View Evaluation>`);
  }

  const userProps = conversationObj?.userProperties as Record<string, unknown> | null | undefined;
  const props = conversationObj?.properties as Record<string, unknown> | null | undefined;

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Evaluation Failed' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${escapeSlackMrkdwn(ctx.agentName)}` },
        { type: 'mrkdwn', text: `*Evaluator:*\n${escapeSlackMrkdwn(evaluatorName)}` },
      ],
    },
  ];

  const userPropsBlock = formatPropertiesBlock('User Properties', userProps);
  if (userPropsBlock) blocks.push(userPropsBlock);
  const propsBlock = formatPropertiesBlock('Properties', props);
  if (propsBlock) blocks.push(propsBlock);

  blocks.push(...conditionSections);

  if (links.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: links.join('  |  ') } });
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Inkeep' }] });

  return { text, blocks };
}

/** Payload for Manage UI "Test" deliveries to Slack incoming webhooks. */
export function buildTestSlackPayload(
  envelope: Record<string, unknown>,
  ctx: SlackContext
): Record<string, unknown> {
  const data = (envelope.data as Record<string, unknown>) ?? {};
  const conversation = data.conversation as Record<string, unknown> | undefined;
  const title = (conversation?.title as string) || 'Test webhook delivery';
  const text = `Test Webhook: ${escapeSlackMrkdwn(title)}`;

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: 'Test Webhook Delivery' } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Conversation:*\n${escapeSlackMrkdwn(title)}` },
        { type: 'mrkdwn', text: `*Agent:*\n${escapeSlackMrkdwn(ctx.agentName)}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'This message confirms your Slack incoming webhook is configured correctly.',
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Inkeep' }],
    },
  ];

  return { ...envelope, text, blocks };
}

function buildConversationErrorSlack(
  data: Record<string, unknown>,
  eventType: WebhookEventType,
  ctx: SlackContext
): { text: string; blocks: unknown[] } {
  const conversation = data.conversation as Record<string, unknown> | undefined;
  const conversationId = conversation?.id as string | undefined;
  const tool = data.tool as { id?: string; name?: string } | undefined;
  const toolName = tool?.name;
  const contextDef = data.contextDefinition as { id?: string } | undefined;
  const reason = (data.reason as string) || 'Unknown error';

  const label = eventType.replace('conversation.', '').replace('.error', '');
  const text = `Conversation ${label} error: ${reason}`;

  const baseProjectUrl = buildProjectUrl(ctx);
  const convUrl = conversationId
    ? `${baseProjectUrl}/traces/conversations/${conversationId}`
    : undefined;

  const userProps = conversation?.userProperties as Record<string, unknown> | null | undefined;
  const props = conversation?.properties as Record<string, unknown> | null | undefined;

  const fields: Array<{ type: string; text: string }> = [
    { type: 'mrkdwn', text: `*Agent:*\n${escapeSlackMrkdwn(ctx.agentName)}` },
    { type: 'mrkdwn', text: `*Error Type:*\n${escapeSlackMrkdwn(eventType)}` },
    { type: 'mrkdwn', text: `*Reason:*\n${escapeSlackMrkdwn(reason)}` },
  ];

  if (toolName) {
    fields.push({ type: 'mrkdwn', text: `*Tool:*\n${escapeSlackMrkdwn(toolName)}` });
  }
  if (contextDef?.id) {
    fields.push({
      type: 'mrkdwn',
      text: `*Context Definition:*\n${escapeSlackMrkdwn(contextDef.id)}`,
    });
  }

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: 'Conversation Error' } },
    { type: 'section', fields },
  ];

  const userPropsBlock = formatPropertiesBlock('User Properties', userProps);
  if (userPropsBlock) blocks.push(userPropsBlock);
  const propsBlock = formatPropertiesBlock('Properties', props);
  if (propsBlock) blocks.push(propsBlock);

  if (convUrl) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${convUrl}|View Conversation>` },
    });
  }

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Inkeep' }] });

  return { text, blocks };
}

export function buildSlackPayload(
  eventType: WebhookEventType,
  envelope: Record<string, unknown>,
  ctx: SlackContext,
  meta?: WebhookSlackMeta
): Record<string, unknown> {
  const data = (envelope.data as Record<string, unknown>) ?? {};
  let slackFields: { text: string; blocks: unknown[] };

  switch (eventType) {
    case 'conversation.created':
    case 'conversation.updated':
      slackFields = buildConversationSlack(data, eventType, ctx);
      break;
    case 'feedback.created':
      slackFields = buildFeedbackSlack(data, ctx);
      break;
    case 'event.created':
      slackFields = buildEventSlack(data, ctx);
      break;
    case 'evaluation.failed':
      slackFields = buildEvaluationFailedSlack(data, ctx, meta);
      break;
    case 'conversation.execution.error':
    case 'conversation.generation.error':
    case 'conversation.tool.error':
    case 'conversation.context.error':
      slackFields = buildConversationErrorSlack(data, eventType, ctx);
      break;
    default: {
      const _unreached: never = eventType;
      slackFields = { text: `[${_unreached as string}] event fired`, blocks: [] };
    }
  }

  return { ...envelope, ...slackFields };
}
