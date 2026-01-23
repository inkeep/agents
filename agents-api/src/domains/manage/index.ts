import { OpenAPIHono } from '@hono/zod-openapi';
import type { ManageAppVariables } from '../../types/app';
import cliAuthRoutes from './routes/cliAuth';
import crudRoutes from './routes/index';
import invitationsRoutes from './routes/invitations';
import mcpRoutes from './routes/mcp';
import oauthRoutes from './routes/oauth';
import playgroundTokenRoutes from './routes/playgroundToken';
import projectFullRoutes from './routes/projectFull';
import signozRoutes from './routes/signoz';
import userOrganizationsRoutes from './routes/userOrganizations';

export function createManageRoutes() {
  const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

  // Mount user-organizations routes - global user endpoint
  app.route('/api/users/:userId/organizations', userOrganizationsRoutes);

  // Mount CLI auth routes - for CLI login flow
  app.route('/api/cli', cliAuthRoutes);

  // Mount invitations routes - global invitations endpoint
  app.route('/api/invitations', invitationsRoutes);

  // Mount routes for all entities
  app.route('/tenants/:tenantId', crudRoutes);

  // Mount playground token routes under tenant (uses requireTenantAccess middleware)
  app.route('/tenants/:tenantId/playground/token', playgroundTokenRoutes);

  // Mount SigNoz proxy routes under tenant (uses requireTenantAccess middleware for authorization)
  app.route('/tenants/:tenantId/signoz', signozRoutes);

  // Mount full project routes directly under tenant
  app.route('/tenants/:tenantId', projectFullRoutes);

  // Mount OAuth routes - global OAuth callback endpoint
  app.route('/oauth', oauthRoutes);

  app.route('/mcp', mcpRoutes);

  return app;
}

export const manageRoutes = createManageRoutes();
