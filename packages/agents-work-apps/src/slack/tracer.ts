import { getTracer, setSpanWithError } from '@inkeep/agents-core';

export const tracer = getTracer('agents-work-apps-slack');

export { setSpanWithError };

export const SLACK_SPAN_NAMES = {
  WEBHOOK: 'slack.webhook',
  APP_MENTION: 'slack.app_mention',
  BLOCK_ACTION: 'slack.block_action',
  MODAL_SUBMISSION: 'slack.modal_submission',
  FOLLOW_UP_SUBMISSION: 'slack.follow_up_submission',
  MESSAGE_SHORTCUT: 'slack.message_shortcut',
  STREAM_AGENT_RESPONSE: 'slack.stream_agent_response',
  OPEN_AGENT_SELECTOR_MODAL: 'slack.open_agent_selector_modal',
  OPEN_FOLLOW_UP_MODAL: 'slack.open_follow_up_modal',
  PROJECT_SELECT_UPDATE: 'slack.project_select_update',
  CALL_AGENT_API: 'slack.call_agent_api',
} as const;

export const SLACK_SPAN_KEYS = {
  TEAM_ID: 'slack.team_id',
  CHANNEL_ID: 'slack.channel_id',
  USER_ID: 'slack.user_id',
  EVENT_TYPE: 'slack.event_type',
  INNER_EVENT_TYPE: 'slack.inner_event_type',
  CALLBACK_ID: 'slack.callback_id',
  ACTION_IDS: 'slack.action_ids',
  THREAD_TS: 'slack.thread_ts',
  MESSAGE_TS: 'slack.message_ts',
  TENANT_ID: 'slack.tenant_id',
  PROJECT_ID: 'slack.project_id',
  AGENT_ID: 'slack.agent_id',
  CONVERSATION_ID: 'slack.conversation_id',
  OUTCOME: 'slack.outcome',
  IS_BOT_MESSAGE: 'slack.is_bot_message',
  HAS_QUERY: 'slack.has_query',
  IS_IN_THREAD: 'slack.is_in_thread',
  STREAM_FINALIZATION_FAILED: 'slack.stream_finalization_failed',
  CONTENT_ALREADY_DELIVERED: 'slack.content_already_delivered',
} as const;

export type SlackOutcome =
  | 'handled'
  | 'ignored_bot_message'
  | 'ignored_unknown_event'
  | 'ignored_no_action_match'
  | 'ignored_slack_retry'
  | 'url_verification'
  | 'validation_error'
  | 'signature_invalid'
  | 'error';
