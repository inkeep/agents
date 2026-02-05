/**
 * Slack Events Module - @mention Flow
 *
 * This module handles all @mention interactions in Slack channels and threads.
 *
 * Directory structure:
 * - app-mention.ts      - Main @mention event handler
 * - block-actions.ts    - Button click handlers (share, modal trigger)
 * - modal-submission.ts - Agent selector modal form submission
 * - streaming.ts        - Agent response streaming to Slack
 * - utils.ts            - Shared utilities (error handling, markdown conversion, API helpers)
 *
 * Flow overview:
 * 1. User @mentions bot → app-mention.ts handles initial routing
 * 2. Channel + query → Stream response directly
 * 3. Thread + no query → Show modal selector button
 * 4. User clicks button → block-actions.ts opens modal
 * 5. User submits modal → modal-submission.ts executes agent
 * 6. Response → streaming.ts (public) or direct post (ephemeral)
 */

export type { InlineSelectorMetadata } from './app-mention';
export { handleAppMention } from './app-mention';
export {
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
  fetchAgentsForTenant,
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
