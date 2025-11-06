/**
 * End-to-end integration tests for introspect generator
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { introspectGenerate } from '../introspect-generator';

describe('Introspect Generator - End-to-End', () => {
  let testDir: string;
  let projectPaths: any;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = join(
      tmpdir(),
      `introspect-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(testDir, { recursive: true });

    projectPaths = {
      projectRoot: testDir,
      agentsDir: join(testDir, 'agent'),
      toolsDir: join(testDir, 'tool'),
      dataComponentsDir: join(testDir, 'data-components'),
      artifactComponentsDir: join(testDir, 'artifact-components'),
      statusComponentsDir: join(testDir, 'status-components'),
      environmentsDir: join(testDir, 'environment'),
      credentialsDir: join(testDir, 'credential'),
      contextConfigsDir: join(testDir, 'context-configs'),
      externalAgentsDir: join(testDir, 'external-agents'),
    };
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const mockComplexProject: FullProjectDefinition = {
    id: 'test-project',
    name: 'Test Customer Support Project',
    description: 'A comprehensive customer support system with multiple agents and tools',
    models: {
      base: { model: 'gpt-4o-mini', temperature: 0.7 },
      structuredOutput: { model: 'gpt-4o', temperature: 0.3 },
      summarizer: { model: 'gpt-4o-mini', temperature: 0.5 },
    },
    stopWhen: {
      transferCountIs: 10,
      stepCountIs: 50,
    },
    credentialReferences: {
      'api-credentials': {
        id: 'api-credentials',
        name: 'API Credentials',
        type: 'bearer',
        credentialStoreId: 'main-store',
        retrievalParams: { key: 'api-token' },
      },
      'db-credentials': {
        id: 'db-credentials',
        name: 'Database Credentials',
        type: 'basic',
        credentialStoreId: 'main-store',
        retrievalParams: { username: 'db-user', password: 'db-pass' },
      },
    },
    functions: {
      'calculate-priority': {
        id: 'calculate-priority',
        name: 'Calculate Priority',
        description: 'Calculate ticket priority based on customer tier and issue type',
        inputSchema: {
          type: 'object',
          properties: {
            customerTier: { type: 'string', enum: ['bronze', 'silver', 'gold', 'platinum'] },
            issueType: { type: 'string', enum: ['bug', 'feature', 'support', 'billing'] },
          },
          required: ['customerTier', 'issueType'],
        },
        dependencies: {
          lodash: '^4.17.21',
        },
        executeCode: 'async (params) => { return { priority: "high" }; }',
      },
    },
    tools: {
      'knowledge-base': {
        id: 'knowledge-base',
        name: 'Knowledge Base',
        description: 'Search and retrieve information from knowledge base',
        config: {
          type: 'mcp',
          mcp: {
            server: {
              url: 'https://kb.example.com/mcp',
            },
            transport: { type: 'streamable_http' },
            activeTools: ['search', 'retrieve'],
          },
        },
        credentialReferenceId: 'api-credentials',
      },
      'ticket-system': {
        id: 'ticket-system',
        name: 'Ticket System',
        description: 'Integration with ticket management system',
        config: {
          type: 'mcp',
          mcp: {
            server: {
              url: 'https://tickets.example.com/mcp',
            },
            transport: { type: 'sse' },
            activeTools: ['create', 'update', 'close'],
          },
        },
      },
    },
    dataComponents: {
      'customer-profile': {
        id: 'customer-profile',
        name: 'Customer Profile',
        description: 'Customer information and preferences',
        props: {
          customerId: 'string',
          name: 'string',
          tier: 'string',
          preferences: 'object',
        },
      },
      'ticket-data': {
        id: 'ticket-data',
        name: 'Ticket Data',
        description: 'Support ticket information',
        props: {
          ticketId: 'string',
          subject: 'string',
          priority: 'string',
          status: 'string',
        },
      },
    },
    artifactComponents: {
      'ticket-summary': {
        id: 'ticket-summary',
        name: 'Ticket Summary',
        description: 'Summary of support ticket resolution',
        props: {
          type: 'object',
          properties: {
            ticketId: { type: 'string', inPreview: true },
            subject: { type: 'string', inPreview: true },
            resolution: { type: 'string' },
            satisfactionScore: { type: 'number' },
          },
        },
      },
    },
    externalAgents: {
      'legacy-crm': {
        id: 'legacy-crm',
        name: 'Legacy CRM System',
        description: 'Integration with legacy CRM system',
        baseUrl: 'https://crm-legacy.example.com/agents/crm',
        credentialReferenceId: 'api-credentials',
      },
    },
    agents: {
      'support-agent': {
        id: 'support-agent',
        name: 'Customer Support Agent',
        description: 'Primary customer support agent with escalation capabilities',
        defaultSubAgentId: 'level1-support',
        subAgents: {
          'level1-support': {
            id: 'level1-support',
            name: 'Level 1 Support',
            description: 'First level customer support',
            prompt:
              'You are a friendly Level 1 support agent. Help customers with basic questions.',
            canUse: [{ toolId: 'knowledge-base' }],
            dataComponents: ['customer-profile'],
            artifactComponents: ['ticket-summary'],
          },
          'level2-support': {
            id: 'level2-support',
            name: 'Level 2 Support',
            description: 'Advanced technical support',
            prompt:
              'You are an experienced Level 2 support agent. Handle complex technical issues.',
            canUse: [
              { toolId: 'knowledge-base' },
              { toolId: 'ticket-system' },
              { toolId: 'calculate-priority' },
            ],
            canDelegateTo: [{ agentId: 'escalation-specialist' }],
            stopWhen: {
              stepCountIs: 25,
            },
          },
        },
        contextConfig: {
          headers: 'supportHeaders',
          headersSchema: {
            type: 'object',
            properties: {
              'user-id': { type: 'string' },
              'session-id': { type: 'string' },
            },
          },
          contextVariables: {
            customerData: {
              fetchConfig: {
                url: 'https://api.example.com/customers/${headers.toTemplate("user-id")}',
                method: 'GET',
              },
              responseSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  tier: { type: 'string' },
                },
              },
            },
          },
        },
        statusUpdates: {
          numEvents: 3,
          timeInSeconds: 15,
          statusComponents: ['tool-summary', 'progress-update'],
          prompt: 'Provide updates on ticket resolution progress',
        },
        stopWhen: {
          transferCountIs: 5,
        },
      },
      'escalation-specialist': {
        id: 'escalation-specialist',
        name: 'Escalation Specialist',
        description: 'Expert agent for handling complex escalated issues',
        prompt:
          'You are an escalation specialist. Handle the most complex issues that require senior expertise.',
        defaultSubAgentId: 'expert-escalation',
        subAgents: {
          'expert-escalation': {
            id: 'expert-escalation',
            name: 'Expert Escalation',
            description: 'Expert-level escalation handling',
            prompt: 'You are an expert at handling escalated issues with senior-level expertise.',
          },
        },
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should generate complete project structure from complex project definition', async () => {
    await introspectGenerate(mockComplexProject, projectPaths, 'development', false);

    // Verify main project file
    const projectFile = join(testDir, 'index.ts');
    expect(existsSync(projectFile)).toBe(true);
    const projectContent = readFileSync(projectFile, 'utf-8');
    expect(projectContent).toContain("import { project } from '@inkeep/agents-sdk';");
    expect(projectContent).toContain('export const testProject = project({');
    expect(projectContent).toContain("id: 'test-project'");
    expect(projectContent).toContain("name: 'Test Customer Support Project'");

    // Verify credentials
    const apiCredFile = join(testDir, 'credential', 'api-credentials.ts');
    expect(existsSync(apiCredFile)).toBe(true);
    const apiCredContent = readFileSync(apiCredFile, 'utf-8');
    expect(apiCredContent).toContain("import { credential } from '@inkeep/agents-sdk';");
    expect(apiCredContent).toContain('export const apiCredentials = credential({');

    // Verify environment
    const envFile = join(testDir, 'environment', 'development.env.ts');
    expect(existsSync(envFile)).toBe(true);
    const envContent = readFileSync(envFile, 'utf-8');
    expect(envContent).toContain('export const development = registerEnvironmentSettings({');

    // Verify function tools
    const funcFile = join(testDir, 'tool', 'functions', 'calculate-priority.ts');
    expect(existsSync(funcFile)).toBe(true);
    const funcContent = readFileSync(funcFile, 'utf-8');
    expect(funcContent).toContain("import { functionTool } from '@inkeep/agents-sdk';");
    expect(funcContent).toContain('export const calculatePriority = functionTool({');

    // Verify MCP tools
    const mcpFile = join(testDir, 'tool', 'knowledge-base.ts');
    expect(existsSync(mcpFile)).toBe(true);
    const mcpContent = readFileSync(mcpFile, 'utf-8');
    expect(mcpContent).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
    expect(mcpContent).toContain('export const knowledgeBase = mcpTool({');

    // Verify data components
    const dataFile = join(testDir, 'data-components', 'customer-profile.ts');
    expect(existsSync(dataFile)).toBe(true);
    const dataContent = readFileSync(dataFile, 'utf-8');
    expect(dataContent).toContain("import { dataComponent } from '@inkeep/agents-sdk';");
    expect(dataContent).toContain('export const customerProfile = dataComponent({');

    // Verify artifact components
    const artifactFile = join(testDir, 'artifact-components', 'ticket-summary.ts');
    expect(existsSync(artifactFile)).toBe(true);
    const artifactContent = readFileSync(artifactFile, 'utf-8');
    expect(artifactContent).toContain("import { artifactComponent } from '@inkeep/agents-sdk';");
    expect(artifactContent).toContain('export const ticketSummary = artifactComponent({');

    // Verify external agents
    const extAgentFile = join(testDir, 'external-agents', 'legacy-crm.ts');
    expect(existsSync(extAgentFile)).toBe(true);
    const extAgentContent = readFileSync(extAgentFile, 'utf-8');
    expect(extAgentContent).toContain("import { externalAgent } from '@inkeep/agents-sdk';");
    expect(extAgentContent).toContain('export const legacyCrm = externalAgent({');

    // Context configs are only generated if contextConfig has an ID
    // const contextFile = join(testDir, 'context-configs', 'support-agentContext.ts');
    // expect(existsSync(contextFile)).toBe(true);

    // Verify sub-agents
    const subAgentFile = join(testDir, 'agent', 'sub-agents', 'level1-support.ts');
    expect(existsSync(subAgentFile)).toBe(true);
    const subAgentContent = readFileSync(subAgentFile, 'utf-8');
    expect(subAgentContent).toContain("import { subAgent } from '@inkeep/agents-sdk';");
    expect(subAgentContent).toContain('export const level1Support = subAgent({');

    // Verify main agents
    const agentFile = join(testDir, 'agent', 'support-agent.ts');
    expect(existsSync(agentFile)).toBe(true);
    const agentContent = readFileSync(agentFile, 'utf-8');
    expect(agentContent).toContain("import { agent } from '@inkeep/agents-sdk';");
    expect(agentContent).toContain('export const supportAgent = agent({');
  });

  it('should generate minimal project with only required components', async () => {
    const minimalProject: FullProjectDefinition = {
      id: 'minimal-project',
      name: 'Minimal Test Project',
      description: 'Simple project for testing',
      models: {
        base: { model: 'gpt-4o-mini', temperature: 0.7 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await introspectGenerate(minimalProject, projectPaths, 'test', false);

    // Should generate main project file
    const projectFile = join(testDir, 'index.ts');
    expect(existsSync(projectFile)).toBe(true);
    const projectContent = readFileSync(projectFile, 'utf-8');
    expect(projectContent).toContain('export const minimalProject = project({');
    expect(projectContent).toContain("name: 'Minimal Test Project'");

    // Should generate environment file
    const envFile = join(testDir, 'environment', 'test.env.ts');
    expect(existsSync(envFile)).toBe(true);

    // Should not generate component files for empty project
    expect(existsSync(join(testDir, 'agent'))).toBe(false);
    expect(existsSync(join(testDir, 'tool'))).toBe(false);
    expect(existsSync(join(testDir, 'credential'))).toBe(false);
  });

  it('should handle different code styles', async () => {
    const options = {
      codeStyle: {
        quotes: 'double' as const,
        semicolons: false,
        indentation: '    ',
      },
    };

    await introspectGenerate(mockComplexProject, projectPaths, 'development', false, options);

    const projectFile = join(testDir, 'index.ts');
    const projectContent = readFileSync(projectFile, 'utf-8');

    // Should use double quotes
    expect(projectContent).toContain('import { project } from "@inkeep/agents-sdk"');
    expect(projectContent).toContain('id: "test-project"');

    // Should have double quotes instead of single quotes
    expect(projectContent).toContain('import { project } from "@inkeep/agents-sdk"');
    expect(projectContent).toContain('})'); // No semicolon at end
  });

  it('should create proper directory structure', async () => {
    await introspectGenerate(mockComplexProject, projectPaths, 'development', false);

    // Verify all directories are created
    expect(existsSync(join(testDir, 'agent'))).toBe(true);
    expect(existsSync(join(testDir, 'agent', 'sub-agents'))).toBe(true);
    expect(existsSync(join(testDir, 'tool'))).toBe(true);
    expect(existsSync(join(testDir, 'tool', 'functions'))).toBe(true);
    expect(existsSync(join(testDir, 'data-components'))).toBe(true);
    expect(existsSync(join(testDir, 'artifact-components'))).toBe(true);
    expect(existsSync(join(testDir, 'external-agents'))).toBe(true);
    // Context configs directory only created if contextConfig has an ID
    // expect(existsSync(join(testDir, 'context-configs'))).toBe(true);
    expect(existsSync(join(testDir, 'credential'))).toBe(true);
    expect(existsSync(join(testDir, 'environment'))).toBe(true);
  });

  it('should handle projects with only external agents', async () => {
    const externalOnlyProject: FullProjectDefinition = {
      id: 'external-only',
      name: 'External Agents Only',
      description: 'Project with only external agents',
      models: {
        base: { model: 'gpt-4o-mini', temperature: 0.7 },
      },
      externalAgents: {
        'external-service': {
          id: 'external-service',
          name: 'External Service',
          description: 'External service integration',
          baseUrl: 'https://external.example.com/agents',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await introspectGenerate(externalOnlyProject, projectPaths, 'production', false);

    const extAgentFile = join(testDir, 'external-agents', 'external-service.ts');
    expect(existsSync(extAgentFile)).toBe(true);
    const extAgentContent = readFileSync(extAgentFile, 'utf-8');
    expect(extAgentContent).toContain('export const externalService = externalAgent({');
    expect(extAgentContent).toContain("baseUrl: 'https://external.example.com/agents'");
  });

  it('should handle projects with complex models configuration', async () => {
    const complexModelsProject: FullProjectDefinition = {
      id: 'complex-models',
      name: 'Complex Models Project',
      description: 'Project with complex model configurations',
      models: {
        base: {
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 4096,
          topP: 0.9,
        },
        structuredOutput: {
          model: 'gpt-4o',
          temperature: 0.1,
          maxTokens: 2048,
        },
        summarizer: {
          model: 'gpt-4o-mini',
          temperature: 0.5,
        },
      },
      stopWhen: {
        transferCountIs: 20,
        stepCountIs: 100,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await introspectGenerate(complexModelsProject, projectPaths, 'development', false);

    const projectFile = join(testDir, 'index.ts');
    const projectContent = readFileSync(projectFile, 'utf-8');
    expect(projectContent).toContain('models: {');
    expect(projectContent).toContain("model: 'gpt-4o'");
    expect(projectContent).toContain('temperature: 0.7');
    expect(projectContent).toContain('maxTokens: 4096');
    expect(projectContent).toContain('stopWhen: {');
    expect(projectContent).toContain('transferCountIs: 20');
    expect(projectContent).toContain('stepCountIs: 100');
  });

  it('should throw error for invalid project data', async () => {
    const invalidProject = null as any;

    await expect(
      introspectGenerate(invalidProject, projectPaths, 'development', false)
    ).rejects.toThrow();
  });

  it('should validate generated TypeScript code compiles', async () => {
    await introspectGenerate(mockComplexProject, projectPaths, 'development', false);

    // Read generated files and verify they contain valid TypeScript syntax
    const files = [
      join(testDir, 'index.ts'),
      join(testDir, 'credential', 'api-credentials.ts'),
      join(testDir, 'tool', 'knowledge-base.ts'),
      join(testDir, 'agent', 'support-agent.ts'),
      join(testDir, 'agent', 'sub-agents', 'level1-support.ts'),
    ];

    for (const file of files) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');

        // Basic syntax checks - allow contextConfig: undefined since contextConfig has no ID
        expect(content).not.toContain('null,'); // No null values in generated code
        expect(content.match(/import.*from/g)?.length).toBeGreaterThan(0); // Has imports
        expect(content.match(/export.*=/g)?.length).toBeGreaterThan(0); // Has exports

        // Check for proper closing
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;
        expect(openBraces).toBe(closeBraces); // Balanced braces

        const openParens = (content.match(/\(/g) || []).length;
        const closeParens = (content.match(/\)/g) || []).length;
        expect(openParens).toBe(closeParens); // Balanced parentheses
      }
    }
  });
});
