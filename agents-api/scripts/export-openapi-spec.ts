/**
 * OpenAPI Specification Export Script
 *
 * Generates a static OpenAPI 3.1 spec from the Hono routes and writes it to disk.
 * This allows agents-docs to build offline without fetching from a running server.
 *
 * Usage: pnpm export-openapi
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createEvalRoutes, createManageRoutes, createRunRoutes } from '../src/domains';
import { workflowRoutes } from '../src/domains/evals/workflow/routes';

function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = sortObjectKeys(obj[key]);
        return acc;
      },
      {} as Record<string, any>
    );
}

function createSpecApp() {
  const app = new OpenAPIHono();

  // Mount all domain routes with the same paths as createApp.ts
  app.route('/manage', createManageRoutes());
  app.route('/run', createRunRoutes());
  app.route('/evals', createEvalRoutes());
  app.route('/.well-known', workflowRoutes);

  return app;
}

function generateSpec() {
  const app = createSpecApp();

  const document = app.getOpenAPIDocument({
    openapi: '3.1.0',
    info: {
      title: 'Inkeep Agents API',
      version: '1.0.0',
      description: 'REST API for the Inkeep Agent Framework.',
    },
    servers: [
      {
        url: 'https://agents-api.inkeep.com',
        description: 'Production Server',
      },
      {
        url: 'http://localhost:3002',
        description: 'Local Development Server',
      },
    ],
    tags: [
      { name: 'A2A', description: 'Agent-to-Agent communication endpoints' },
      { name: 'Agents', description: 'Operations for managing agents' },
      { name: 'AgentFull', description: 'Operations for managing complete agent definitions' },
      { name: 'AgentToolRelations', description: 'Operations for managing agent tool relationships' },
      { name: 'APIKeys', description: 'Operations for managing API keys' },
      { name: 'ArtifactComponents', description: 'Operations for managing artifact components' },
      { name: 'Branches', description: 'Operations for managing branches' },
      { name: 'Chat', description: 'Chat completions endpoints' },
      { name: 'CLI', description: 'CLI authentication endpoints' },
      { name: 'ContextConfigs', description: 'Operations for managing context configurations' },
      { name: 'Conversations', description: 'Operations for managing conversations' },
      { name: 'Credentials', description: 'Operations for managing credentials' },
      { name: 'CredentialStores', description: 'Operations for managing credential stores' },
      { name: 'DataComponents', description: 'Operations for managing data components' },
      { name: 'Evaluations', description: 'Operations for managing evaluations' },
      { name: 'ExternalAgents', description: 'Operations for managing external agents' },
      { name: 'FullAgent', description: 'Operations for managing complete agent definitions' },
      { name: 'FullProject', description: 'Operations for managing complete project definitions' },
      { name: 'FunctionTools', description: 'Operations for managing function tools' },
      { name: 'Functions', description: 'Operations for managing functions' },
      { name: 'Invitations', description: 'Operations for managing invitations' },
      { name: 'MCP', description: 'MCP (Model Context Protocol) endpoints' },
      { name: 'MCPCatalog', description: 'Operations for MCP catalog' },
      { name: 'OAuth', description: 'OAuth authentication endpoints' },
      { name: 'ProjectFull', description: 'Operations for managing complete project definitions' },
      { name: 'ProjectMembers', description: 'Operations for managing project members' },
      { name: 'ProjectPermissions', description: 'Operations for managing project permissions' },
      { name: 'Projects', description: 'Operations for managing projects' },
      { name: 'SubAgentArtifactComponents', description: 'Operations for managing sub agent artifact components' },
      { name: 'SubAgentDataComponents', description: 'Operations for managing sub agent data components' },
      { name: 'SubAgentExternalAgentRelations', description: 'Operations for managing sub agent external agent relationships' },
      { name: 'SubAgentFunctionTools', description: 'Operations for managing sub agent function tools' },
      { name: 'SubAgentRelations', description: 'Operations for managing sub agent relationships' },
      { name: 'SubAgents', description: 'Operations for managing sub agents' },
      { name: 'SubAgentTeamAgentRelations', description: 'Operations for managing sub agent team agent relationships' },
      { name: 'SubAgentToolRelations', description: 'Operations for managing sub agent tool relationships' },
      { name: 'ThirdPartyMCPServers', description: 'Operations for managing third-party MCP servers' },
      { name: 'Tools', description: 'Operations for managing MCP tools' },
      { name: 'Triggers', description: 'Operations for managing triggers' },
      { name: 'UserOrganizations', description: 'Operations for managing user organizations' },
      { name: 'UserProjectMemberships', description: 'Operations for managing user project memberships' },
      { name: 'Webhooks', description: 'Webhook endpoints' },
      { name: 'Workflows', description: 'Workflow trigger endpoints' },
    ],
  });

  // Add security schemes
  document.components = {
    ...document.components,
    securitySchemes: {
      ...(document.components?.securitySchemes || {}),
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
        description:
          'Session-based authentication using HTTP-only cookies. Cookies are automatically sent by browsers. For server-side requests, include cookies with names starting with "better-auth." in the Cookie header.',
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        description:
          'Bearer token authentication. Use this for API clients and service-to-service communication. Set the Authorization header to "Bearer <token>".',
      },
    },
  };

  // Set global security (allows either cookieAuth OR bearerAuth)
  document.security = [
    {
      cookieAuth: [],
      bearerAuth: [],
    },
  ];

  return document;
}

// Main execution
const spec = generateSpec();
const sortedSpec = sortObjectKeys(spec);
const outputPath = resolve(process.cwd(), 'openapi-spec.json');

writeFileSync(outputPath, `${JSON.stringify(sortedSpec, null, 2)}\n`, 'utf-8');

console.log(`✅ OpenAPI spec exported to ${outputPath}`);
console.log(`   - ${Object.keys(spec.paths || {}).length} paths`);
console.log(`   - ${Object.keys(spec.components?.schemas || {}).length} schemas`);
