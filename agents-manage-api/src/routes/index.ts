import { OpenAPIHono } from '@hono/zod-openapi';

import agentArtifactComponentsRoutes from './agentArtifactComponents';
import agentDataComponentsRoutes from './agentDataComponents';
import agentGraphRoutes from './agentGraph';
import agentRelationsRoutes from './agentRelations';
// Import existing CRUD route modules (others can be added as they're created)
import agentsRoutes from './agents';
import agentToolRelationsRoutes from './agentToolRelations';
import apiKeysRoutes from './apiKeys';
import artifactComponentsRoutes from './artifactComponents';
import contextConfigsRoutes from './contextConfigs';
import credentialsRoutes from './credentials';
import dataComponentsRoutes from './dataComponents';
import externalAgentsRoutes from './externalAgents';
import graphFullRoutes from './graphFull';
import projectsRoutes from './projects';
import toolsRoutes from './tools';

const app = new OpenAPIHono();

// Mount projects route first (no projectId in path)
app.route('/projects', projectsRoutes);

// Mount existing CRUD routes under project scope
app.route('/projects/:projectId/graphs/:graphId/agents', agentsRoutes);
app.route('/projects/:projectId/graphs/:graphId/agent-relations', agentRelationsRoutes);
app.route('/projects/:projectId/agent-graphs', agentGraphRoutes);
app.route('/projects/:projectId/graphs/:graphId/agent-tool-relations', agentToolRelationsRoutes);
app.route('/projects/:projectId/graphs/:graphId/agent-artifact-components', agentArtifactComponentsRoutes);
app.route('/projects/:projectId/graphs/:graphId/agent-data-components', agentDataComponentsRoutes);
app.route('/projects/:projectId/artifact-components', artifactComponentsRoutes);
app.route('/projects/:projectId/context-configs', contextConfigsRoutes);
app.route('/projects/:projectId/credentials', credentialsRoutes);
app.route('/projects/:projectId/data-components', dataComponentsRoutes);
app.route('/projects/:projectId/external-agents', externalAgentsRoutes);
app.route('/projects/:projectId/tools', toolsRoutes);
app.route('/projects/:projectId/api-keys', apiKeysRoutes);

// Mount new full graph CRUD routes
app.route('/projects/:projectId/graph', graphFullRoutes);

export default app;
