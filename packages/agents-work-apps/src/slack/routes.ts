/**
 * Slack Work App Routes - Entry Point
 *
 * This file re-exports the modular router from routes/index.ts.
 * All routes are now organized in separate files under routes/:
 *
 * - routes/oauth.ts      - OAuth flow (/install, /oauth_redirect)
 * - routes/workspaces.ts - Workspace management
 * - routes/users.ts      - User linking and settings
 * - routes/resources.ts  - Projects and agents listing
 * - routes/events.ts     - Slack events, commands, webhooks
 * - routes/internal.ts   - Debug and internal endpoints
 * - routes/index.ts      - Main router composition
 *
 * For handler functions, see services/events/handlers.ts
 */

export { getBotTokenForTeam, setBotTokenForTeam } from './routes/oauth';
export { pendingSessionTokens } from './routes/users';
export { getChannelAgentConfig, getWorkspaceDefaultAgent } from './services/events';

import slackRouter from './routes/index';
export default slackRouter;
