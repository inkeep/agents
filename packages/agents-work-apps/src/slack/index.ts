/**
 * Slack Work App
 *
 * Provides Slack integration for Inkeep Agents including:
 * - OAuth-based workspace installation
 * - User account linking via JWT tokens
 * - Slash commands for agent interaction
 * - @mention support for workspace-wide agent access
 * - Channel-specific agent configuration
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import slackRouter from './routes/index';
import type { WorkAppsVariables } from './types';

export function createSlackRoutes() {
  const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();
  app.route('/', slackRouter);
  return app;
}

export const slackRoutes = createSlackRoutes();

export type { DispatchOptions, SlackEventDispatchResult } from './dispatcher';
export { dispatchSlackEvent } from './dispatcher';
export { getBotTokenForTeam, setBotTokenForTeam } from './routes/oauth';
export { getChannelAgentConfig, getWorkspaceDefaultAgent } from './services/events';
export * from './services/nango';
export * from './types';
