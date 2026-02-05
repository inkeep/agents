/**
 * Slack Events Module - @mention Flow
 *
 * This module handles all @mention interactions in Slack channels and threads.
 *
 * Directory structure:
 * - app-mention.ts      - Main @mention event handler
 * - block-actions.ts    - Button click handlers (share, modal trigger, message shortcuts)
 * - modal-submission.ts - Agent selector modal form submission
 * - streaming.ts        - Agent response streaming to Slack
 * - utils.ts            - Shared utilities (error handling, markdown conversion, API helpers)
 *
 * Flow overview:
 * 1. User @mentions bot → app-mention.ts handles initial routing
 * 2. Channel + no query → Show "Trigger Agent" button, opens modal
 * 3. Thread + no query → Auto-analyze thread context with default agent
 * 4. Any context + query → Stream response directly
 * 5. User clicks button → block-actions.ts opens modal
 * 6. User submits modal → modal-submission.ts executes agent
 * 7. Response → streaming.ts (public) or direct post (ephemeral)
 */

export type { InlineSelectorMetadata } from './app-mention';
export { handleAppMention } from './app-mention';
export {
  handleMessageShortcut,
  handleOpenAgentSelectorModal,
  handleShareToChannel,
  handleShareToThread,
} from './block-actions';
export { handleModalSubmission } from './modal-submission';
export type { StreamResult } from './streaming';
export { streamAgentResponse } from './streaming';
export {
  checkIfBotThread,
  classifyError,
  fetchAgentsForProject,
  fetchProjectsForTenant,
  generateSlackConversationId,
  getChannelAgentConfig,
  getThreadContext,
  getUserFriendlyErrorMessage,
  getWorkspaceDefaultAgent,
  markdownToMrkdwn,
  SlackErrorType,
  sendResponseUrlMessage,
} from './utils';
