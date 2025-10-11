import { OpenAPIHono } from '@hono/zod-openapi';
import agentRoutes from './agent';
import apiKeysRoutes from './apiKeys';
import artifactComponentsRoutes from './artifactComponents';
import contextConfigsRoutes from './contextConfigs';
import credentialsRoutes from './credentials';
import dataComponentsRoutes from './dataComponents';
import externalAgentsRoutes from './externalAgents';
import functionsRoutes from './functions';
import functionToolsRoutes from './functionTools';
import graphFullRoutes from './agentFull';
import projectsRoutes from './projects';
import subAgentArtifactComponentsRoutes from './subAgentArtifactComponents';
import subAgentDataComponentsRoutes from './subAgentDataComponents';
import subAgentRelationsRoutes from './subAgentRelations';
// Import existing route modules (others can be added as they're created)
import subAgentsRoutes from './subAgents';
import subAgentToolRelationsRoutes from './subAgentToolRelations';
import toolsRoutes from './tools';

const app = new OpenAPIHono();

// Mount projects route first (no projectId in path)
app.route('/projects', projectsRoutes);

// Mount existing routes under project scope
app.route('/projects/:projectId/agents/:agentId/sub-agents', subAgentsRoutes);
app.route('/projects/:projectId/agents/:agentId/sub-agent-relations', subAgentRelationsRoutes);
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
app.route('/projects/:projectId/data-components', dataComponentsRoutes);
app.route('/projects/:projectId/agents/:agentId/external-agents', externalAgentsRoutes);
app.route('/projects/:projectId/agents/:agentId/function-tools', functionToolsRoutes);
app.route('/projects/:projectId/functions', functionsRoutes);
app.route('/projects/:projectId/tools', toolsRoutes);
app.route('/projects/:projectId/api-keys', apiKeysRoutes);

// Mount new full agent routes
app.route('/projects/:projectId/agent', graphFullRoutes);

export default app;
