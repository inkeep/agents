/**
 * Work Apps Domain
 *
 * Modular integration layer for third-party work applications (Slack, GitHub, etc.)
 * and platform MCP servers (feedback, conversations, etc.).
 * Work app implementations are in @inkeep/agents-work-apps package.
 *
 * Each work app is mounted as a sub-route:
 * - /work-apps/slack/* - Slack workspace installation, user linking, commands
 * - /work-apps/github/* - GitHub integration (mounted separately in createApp)
 * - /work-apps/feedback/mcp - Feedback MCP server for agent consumption
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { feedbackMcpRoutes } from '@inkeep/agents-work-apps/feedback';
import { slackRoutes, type WorkAppsVariables } from '@inkeep/agents-work-apps/slack';

export function createWorkAppsRoutes() {
  const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

  app.route('/slack', slackRoutes);
  app.route('/feedback/mcp', feedbackMcpRoutes);

  return app;
}

export const workAppsRoutes = createWorkAppsRoutes();
