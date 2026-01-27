/**
 * Work Apps Domain
 *
 * Modular integration layer for third-party work applications (Slack, GitHub, etc.)
 * Designed to be easily extractable to a separate package/repo.
 *
 * Each work app is mounted as a sub-route:
 * - /work-apps/slack/* - Slack workspace installation, user linking, commands
 * - /work-apps/github/* - (future) GitHub integration
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import slackRoutes from './slack/routes';
import type { WorkAppsVariables } from './types';

export function createWorkAppsRoutes() {
  const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

  // Mount Slack routes - workspace installation, user linking, slash commands
  app.route('/slack', slackRoutes);

  // Future work apps can be mounted here:
  // app.route('/github', githubWorkAppRoutes);
  // app.route('/notion', notionRoutes);

  return app;
}

export const workAppsRoutes = createWorkAppsRoutes();
