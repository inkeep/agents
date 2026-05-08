import {
  type ConversationDetailSchema,
  type ConversationSelect,
  type EventSelect,
  type FeedbackSelect,
  getConversationProperties,
  getConversationUserProperties,
  type MessageSelect,
  type WebhookMessageSchema,
} from '@inkeep/agents-core';
import type { z } from 'zod';

export const CONVERSATION_DETAIL_MESSAGE_LIMIT = 200;

export type WebhookMessage = z.infer<typeof WebhookMessageSchema>;
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

export function toIsoString(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
  }
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/i.test(value);
  const normalized = hasTimezone ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

export function formatMessage(m: MessageSelect): WebhookMessage {
  const content = (m.content as { text?: string } | null)?.text ?? null;
  return {
    id: m.id,
    role: m.role === 'agent' ? 'assistant' : 'user',
    content,
    createdAt: toIsoString(m.createdAt),
  };
}

export function formatConversationDetail(
  conversation: ConversationSelect,
  messages: MessageSelect[]
): ConversationDetail {
  return {
    id: conversation.id,
    agentId: conversation.agentId ?? null,
    title: conversation.title ?? null,
    userProperties: getConversationUserProperties(conversation),
    properties: getConversationProperties(conversation),
    createdAt: toIsoString(conversation.createdAt),
    updatedAt: toIsoString(conversation.updatedAt),
    messages: messages.slice(-CONVERSATION_DETAIL_MESSAGE_LIMIT).map(formatMessage),
  };
}

export function formatFeedback(feedback: FeedbackSelect) {
  const { tenantId: _t, projectId: _p, createdAt, updatedAt, ...rest } = feedback;
  return {
    ...rest,
    createdAt: toIsoString(createdAt),
    updatedAt: toIsoString(updatedAt),
  };
}

export function formatEvent(event: EventSelect) {
  const { tenantId: _t, projectId: _p, createdAt, updatedAt, ...rest } = event;
  return {
    ...rest,
    createdAt: toIsoString(createdAt),
    updatedAt: toIsoString(updatedAt),
  };
}
