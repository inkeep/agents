import { OpenAPIHono } from '@hono/zod-openapi';
import agentRoutes from './agent';
import agentFullRoutes from './agentFull';
import apiKeysRoutes from './apiKeys';
import artifactComponentsRoutes from './artifactComponents';
import branchesRoutes from './branches';
import contextConfigsRoutes from './contextConfigs';
import credentialStoresRoutes from './credentialStores';
import credentialsRoutes from './credentials';
import dataComponentsRoutes from './dataComponents';
import externalAgentsRoutes from './externalAgents';
import functionsRoutes from './functions';
import functionToolsRoutes from './functionTools';
import projectsRoutes from './projects';
import subAgentArtifactComponentsRoutes from './subAgentArtifactComponents';
import subAgentDataComponentsRoutes from './subAgentDataComponents';
import subAgentExternalAgentRelationsRoutes from './subAgentExternalAgentRelations';
import subAgentRelationsRoutes from './subAgentRelations';
// Import existing route modules (others can be added as they're created)
import subAgentsRoutes from './subAgents';
import subAgentTeamAgentRelationsRoutes from './subAgentTeamAgentRelations';
import subAgentToolRelationsRoutes from './subAgentToolRelations';
import toolsRoutes from './tools';

const app = new OpenAPIHono();

// Mount projects route first (no projectId in path)
app.route('/projects', projectsRoutes);

// Mount branches route under project scope
app.route('/projects/:projectId/branches', branchesRoutes);

// Mount existing routes under project scope
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
app.route('/projects/:projectId/artifact-components', artifactComponentsRoutes);
app.route('/projects/:projectId/agents/:agentId/context-configs', contextConfigsRoutes);
app.route('/projects/:projectId/credentials', credentialsRoutes);
app.route('/projects/:projectId/credential-stores', credentialStoresRoutes);
app.route('/projects/:projectId/data-components', dataComponentsRoutes);
app.route('/projects/:projectId/external-agents', externalAgentsRoutes);
app.route('/projects/:projectId/agents/:agentId/function-tools', functionToolsRoutes);
app.route('/projects/:projectId/functions', functionsRoutes);
app.route('/projects/:projectId/tools', toolsRoutes);
app.route('/projects/:projectId/api-keys', apiKeysRoutes);

// Mount new full agent routes
app.route('/projects/:projectId/agent', agentFullRoutes);

export default app;
