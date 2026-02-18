import { OpenAPIHono } from '@hono/zod-openapi';
import { capabilitiesHandler } from '../../routes/capabilities';
import type { ManageAppVariables } from '../../types/app';
import availableAgentsRoutes from './routes/availableAgents';
import cliAuthRoutes from './routes/cliAuth';
import githubRoutes from './routes/github';
import crudRoutes from './routes/index';
import invitationsRoutes from './routes/invitations';
import mcpToolGitHubAccessRoutes from './routes/mcpToolGithubAccess';
import oauthRoutes from './routes/oauth';
import passwordResetLinksRoutes from './routes/passwordResetLinks';
import playgroundTokenRoutes from './routes/playgroundToken';
import projectFullRoutes from './routes/projectFull';
import projectGitHubAccessRoutes from './routes/projectGithubAccess';
import signozRoutes from './routes/signoz';
import userProjectMembershipsRoutes from './routes/userProjectMemberships';
import usersRoutes from './routes/users';

export function createManageRoutes() {
  const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

  // Mount users routes - organizations and providers endpoints
  app.route('/api/users', usersRoutes);

  // Mount CLI auth routes - for CLI login flow
  app.route('/api/cli', cliAuthRoutes);

  // Mount invitations routes - includes /verify (unauthenticated) and /pending (authenticated)
  app.route('/api/invitations', invitationsRoutes);

  // Mount routes for all entities
  app.route('/tenants/:tenantId', crudRoutes);
  app.route('/tenants/:tenantId/password-reset-links', passwordResetLinksRoutes);

  // Mount playground token routes under tenant (uses requireTenantAccess middleware)
  app.route('/tenants/:tenantId/playground/token', playgroundTokenRoutes);

  // Mount SigNoz proxy routes under tenant (uses requireTenantAccess middleware for authorization)
  app.route('/tenants/:tenantId/signoz', signozRoutes);

  // Mount GitHub routes under tenant (uses requireTenantAccess middleware for authorization)
  app.route('/tenants/:tenantId/github', githubRoutes);

  // User-level routes (tenant-scoped, not project-scoped)
  app.route('/tenants/:tenantId/users/:userId/project-memberships', userProjectMembershipsRoutes);

  // Mount project GitHub access routes under tenant/project
  app.route('/tenants/:tenantId/projects/:projectId/github-access', projectGitHubAccessRoutes);

  // Mount MCP tool GitHub access routes under tenant/project/tool
  app.route(
    '/tenants/:tenantId/projects/:projectId/tools/:toolId/github-access',
    mcpToolGitHubAccessRoutes
  );

  // Mount full project routes directly under tenant
  app.route('/tenants/:tenantId', projectFullRoutes);

  // Mount OAuth routes - global OAuth callback endpoint
  app.route('/oauth', oauthRoutes);

  app.route('/available-agents', availableAgentsRoutes);

  // Server capabilities (sandbox config, etc.)
  app.route('/capabilities', capabilitiesHandler);

  return app;
}

export const manageRoutes = createManageRoutes();
