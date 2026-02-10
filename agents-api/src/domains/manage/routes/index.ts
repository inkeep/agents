import { OpenAPIHono } from '@hono/zod-openapi';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import agentRoutes from './agent';
import agentFullRoutes from './agentFull';
import availableModelsRoutes from './availableModels';
import apiKeysRoutes from './apiKeys';
import artifactComponentsRoutes from './artifactComponents';
import branchesRoutes from './branches';
import contextConfigsRoutes from './contextConfigs';
import conversationsRoutes from './conversations';
import credentialStoresRoutes from './credentialStores';
import credentialsRoutes from './credentials';
import dataComponentsRoutes from './dataComponents';
import evalsRoutes from './evals';
import externalAgentsRoutes from './externalAgents';
import functionsRoutes from './functions';
import functionToolsRoutes from './functionTools';
import mcpCatalogRoutes from './mcpCatalog';
import projectMembersRoutes from './projectMembers';
import projectPermissionsRoutes from './projectPermissions';
import projectsRoutes from './projects';
import refRoutes from './ref';
import subAgentArtifactComponentsRoutes from './subAgentArtifactComponents';
import subAgentDataComponentsRoutes from './subAgentDataComponents';
import subAgentExternalAgentRelationsRoutes from './subAgentExternalAgentRelations';
import subAgentFunctionToolsRoutes from './subAgentFunctionTools';
import subAgentRelationsRoutes from './subAgentRelations';
// Import existing route modules (others can be added as they're created)
import subAgentsRoutes from './subAgents';
import subAgentTeamAgentRelationsRoutes from './subAgentTeamAgentRelations';
import subAgentToolRelationsRoutes from './subAgentToolRelations';
import thirdPartyMCPServersRoutes from './thirdPartyMCPServers';
import toolsRoutes from './tools';
import triggersRoutes from './triggers';
import userProjectMembershipsRoutes from './userProjectMemberships';

const app = new OpenAPIHono();

// Mount projects route first (no projectId in path)
// Note: projects.ts handles its own access checks internally
app.route('/projects', projectsRoutes);

// Apply project access check to all project-scoped routes BEFORE mounting them
// This middleware checks 'view' permission by default
// Individual routes can require higher permissions (use, edit)
app.use('/projects/:projectId/*', requireProjectPermission('view'));

// Mount branches route under project scope
app.route('/projects/:projectId/branches', branchesRoutes);

// Mount ref routes under project scope
app.route('/projects/:projectId/refs', refRoutes);

// Note: projectMembers.ts overrides with 'edit' permission for write operations
app.route('/projects/:projectId/members', projectMembersRoutes);

// Project permissions endpoint - returns current user's permissions for a project
app.route('/projects/:projectId/permissions', projectPermissionsRoutes);

app.route('/projects/:projectId/agents/:agentId/sub-agents', subAgentsRoutes);
app.route('/projects/:projectId/agents/:agentId/sub-agent-relations', subAgentRelationsRoutes);
app.route(
  '/projects/:projectId/agents/:agentId/sub-agents/:subAgentId/external-agent-relations',
  subAgentExternalAgentRelationsRoutes
);
app.route(
  '/projects/:projectId/agents/:agentId/sub-agents/:subAgentId/team-agent-relations',
  subAgentTeamAgentRelationsRoutes
);
app.route('/projects/:projectId/agents', agentRoutes);
app.route(
  '/projects/:projectId/agents/:agentId/sub-agent-tool-relations',
  subAgentToolRelationsRoutes
);
app.route(
  '/projects/:projectId/agents/:agentId/sub-agent-artifact-components',
  subAgentArtifactComponentsRoutes
);
app.route(
  '/projects/:projectId/agents/:agentId/sub-agent-data-components',
  subAgentDataComponentsRoutes
);
app.route(
  '/projects/:projectId/agents/:agentId/sub-agent-function-tools',
  subAgentFunctionToolsRoutes
);
app.route('/projects/:projectId/artifact-components', artifactComponentsRoutes);
app.route('/projects/:projectId/agents/:agentId/context-configs', contextConfigsRoutes);
app.route('/projects/:projectId/conversations', conversationsRoutes);
app.route('/projects/:projectId/credentials', credentialsRoutes);
app.route('/projects/:projectId/credential-stores', credentialStoresRoutes);
app.route('/projects/:projectId/data-components', dataComponentsRoutes);
app.route('/projects/:projectId/external-agents', externalAgentsRoutes);
app.route('/projects/:projectId/agents/:agentId/function-tools', functionToolsRoutes);
app.route('/projects/:projectId/functions', functionsRoutes);
app.route('/projects/:projectId/tools', toolsRoutes);
app.route('/projects/:projectId/api-keys', apiKeysRoutes);
app.route('/projects/:projectId/agent', agentFullRoutes);
app.route('/projects/:projectId/mcp-catalog', mcpCatalogRoutes);
app.route('/projects/:projectId/third-party-mcp-servers', thirdPartyMCPServersRoutes);
app.route('/projects/:projectId/agents/:agentId/triggers', triggersRoutes);

// Evaluation routes (datasets, evaluators, etc.)
app.route('/projects/:projectId/evals', evalsRoutes);

// Tenant-level routes (not project-scoped)
app.route('/available-models', availableModelsRoutes);

// User-level routes (not project-scoped)
app.route('/users/:userId/project-memberships', userProjectMembershipsRoutes);

export default app;
