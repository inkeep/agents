/**
 * Slack Events Module
 *
 * Handles all Slack interactions: @mentions, slash commands, button clicks, modals.
 *
 * Directory structure:
 * - app-mention.ts      - Main @mention event handler
 * - block-actions.ts    - Button click handlers (follow-up, share, modal trigger, message shortcuts)
 * - modal-submission.ts - Modal form submissions (initial + follow-up)
 * - streaming.ts        - Agent response streaming to Slack
 * - utils.ts            - Shared utilities (error handling, markdown conversion, API helpers)
 *
 * Flow overview:
 * 1. User @mentions bot → app-mention.ts handles initial routing
 * 2. Channel + no query → Show usage hint
 * 3. Thread + no query → Auto-analyze thread context with default agent
 * 4. Any context + query → Stream response directly
 * 5. User uses /inkeep → modal opens → private ephemeral response with Follow Up button
 * 6. User clicks Follow Up → follow-up modal → new ephemeral response (same conversation)
 */

export type { InlineSelectorMetadata } from './app-mention';
export { handleAppMention } from './app-mention';
export {
  handleMessageShortcut,
  handleOpenAgentSelectorModal,
  handleOpenFollowUpModal,
} from './block-actions';
export { handleFollowUpSubmission, handleModalSubmission } from './modal-submission';
export type { StreamResult } from './streaming';
export { streamAgentResponse } from './streaming';
export {
  checkIfBotThread,
  classifyError,
  fetchAgentsForProject,
  fetchProjectsForTenant,
  findCachedUserMapping,
  generateSlackConversationId,
  getChannelAgentConfig,
  getThreadContext,
  getUserFriendlyErrorMessage,
  getWorkspaceDefaultAgent,
  invalidateUserMappingCache,
  markdownToMrkdwn,
  SlackErrorType,
  sendResponseUrlMessage,
} from './utils';
