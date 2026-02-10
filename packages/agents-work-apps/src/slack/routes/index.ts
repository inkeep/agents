/**
 * Slack Work App Routes - Main Router
 *
 * Modular RESTful API structure:
 *
 * OAuth & Installation (oauth.ts):
 *   GET  /install                    - Redirect to Slack OAuth
 *   GET  /oauth_redirect             - OAuth callback
 *
 * Workspaces (workspaces.ts):
 *   GET  /workspaces                 - List all workspaces
 *   GET  /workspaces/:teamId         - Get workspace details
 *   GET  /workspaces/:teamId/settings - Get workspace settings
 *   PUT  /workspaces/:teamId/settings - Update workspace settings [ADMIN]
 *   DELETE /workspaces/:teamId       - Uninstall workspace [ADMIN]
 *   GET  /workspaces/:teamId/channels - List channels
 *   GET/PUT/DELETE /workspaces/:teamId/channels/:channelId/settings - Channel config
 *   GET  /workspaces/:teamId/users   - List linked users
 *
 * Users (users.ts):
 *   GET  /users/link-status          - Check link status
 *   POST /users/link/verify-token    - Verify JWT link token (primary linking method)
 *   POST /users/connect              - Create Nango session
 *   POST /users/disconnect           - Disconnect/unlink user
 *   GET  /users/status               - Get user connection status
 *
 * Events & Commands (events.ts):
 *   POST /commands                   - Handle slash commands
 *   POST /events                     - Handle Slack events
 *   POST /nango-webhook              - Handle Nango webhooks
 *
 * Internal/Debug (internal.ts):
 *   POST /register-workspace         - Register workspace (memory cache)
 *   GET  /workspace-info             - Get workspace info
 *   POST /debug/generate-token       - Generate test tokens (dev only)
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { WorkAppsVariables } from '../types';
import eventsRouter from './events';
import internalRouter from './internal';
import oauthRouter from './oauth';
import usersRouter from './users';
import workspacesRouter from './workspaces';

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

app.route('/workspaces', workspacesRouter);
app.route('/users', usersRouter);
app.route('/', oauthRouter);
app.route('/', eventsRouter);
app.route('/', internalRouter);

export default app;
