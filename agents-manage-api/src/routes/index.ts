import { OpenAPIHono } from '@hono/zod-openapi';

import agentArtifactComponentsRoutes from './agentArtifactComponents.js';
import agentDataComponentsRoutes from './agentDataComponents.js';
import agentGraphRoutes from './agentGraph.js';
import agentRelationsRoutes from './agentRelations.js';
// Import existing CRUD route modules (others can be added as they're created)
import agentsRoutes from './agents.js';
import agentToolRelationsRoutes from './agentToolRelations.js';
import apiKeysRoutes from './apiKeys.js';
import artifactComponentsRoutes from './artifactComponents.js';
import contextConfigsRoutes from './contextConfigs.js';
import credentialsRoutes from './credentials.js';
import dataComponentsRoutes from './dataComponents.js';
import externalAgentsRoutes from './externalAgents.js';
import graphFullRoutes from './graphFull.js';
import projectsRoutes from './projects.js';
import toolsRoutes from './tools.js';

const app = new OpenAPIHono();

// Mount projects route first (no projectId in path)
app.route('/projects', projectsRoutes);

// Mount existing CRUD routes under project scope
app.route('/projects/:projectId/agents', agentsRoutes);
app.route('/projects/:projectId/agent-relations', agentRelationsRoutes);
app.route('/projects/:projectId/agent-graphs', agentGraphRoutes);
app.route('/projects/:projectId/agent-tool-relations', agentToolRelationsRoutes);
app.route('/projects/:projectId/agent-artifact-components', agentArtifactComponentsRoutes);
app.route('/projects/:projectId/agent-data-components', agentDataComponentsRoutes);
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
