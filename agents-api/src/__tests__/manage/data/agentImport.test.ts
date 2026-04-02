import {
  createArtifactComponent,
  createCredentialReference,
  createDataComponent,
  createExternalAgent,
  createFullAgentServerSide,
  createScheduledTrigger,
  createSkill,
  createTool,
  type FullAgentDefinition,
  generateId,
  getExternalAgent,
  getToolById,
  importFullAgentServerSide,
  listArtifactComponents,
  listDataComponents,
  listExternalAgents,
  listFunctions,
  listScheduledTriggers,
  listSkills,
  listTools,
  listTriggers,
  upsertFunction,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import {
  createTestArtifactComponentData,
  createTestContextConfigDataFull,
  createTestDataComponentData,
  createTestToolData,
} from '../../utils/testHelpers';
import { createTestExternalAgentData, createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../utils/testTenant';

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

const sourceProjectId = 'source-project';
const targetProjectId = 'default';

const createTeamAgentDefinition = (
  teamAgentId: string,
  teamSubAgentId: string
): FullAgentDefinition => ({
  id: teamAgentId,
  name: `Team Agent ${teamAgentId}`,
  description: 'Existing team agent',
  defaultSubAgentId: teamSubAgentId,
  subAgents: {
    [teamSubAgentId]: {
      ...createTestSubAgentData({ id: teamSubAgentId, suffix: ' Team' }),
      type: 'internal',
      canUse: [],
    },
  },
});

const createSourceAgentDefinition = (params: {
  agentId: string;
  defaultSubAgentId: string;
  secondarySubAgentId: string;
  toolId: string;
  functionToolId: string;
  functionId: string;
  dataComponentId: string;
  artifactComponentId: string;
  externalAgentId: string;
  skillId: string;
  contextConfigId: string;
  teamAgentId?: string;
}): FullAgentDefinition => {
  const canDelegateTo: Array<
    | string
    | { externalAgentId: string; headers: Record<string, string> }
    | { agentId: string; headers: Record<string, string> }
  > = [
    params.secondarySubAgentId,
    {
      externalAgentId: params.externalAgentId,
      headers: { 'X-External': 'source' },
    },
  ];

  if (params.teamAgentId) {
    canDelegateTo.push({
      agentId: params.teamAgentId,
      headers: { 'X-Team': 'source' },
    });
  }

  return {
    id: params.agentId,
    name: `Source Agent ${params.agentId}`,
    description: 'Source agent description',
    defaultSubAgentId: params.defaultSubAgentId,
    contextConfig: createTestContextConfigDataFull({ id: params.contextConfigId }),
    models: {
      base: {
        model: 'claude-sonnet-4-20250514',
      },
    },
    prompt: 'You are the source agent.',
    stopWhen: {
      transferCountIs: 3,
    },
    statusUpdates: {
      enabled: true,
      prompt: 'Provide progress updates',
    },
    subAgents: {
      [params.defaultSubAgentId]: {
        ...createTestSubAgentData({ id: params.defaultSubAgentId, suffix: ' Router' }),
        type: 'internal',
        canUse: [
          {
            toolId: params.toolId,
            toolSelection: ['testTool'],
            headers: { Authorization: 'Bearer test-token' },
            toolPolicies: {
              approve: {
                needsApproval: true,
              },
            },
          },
          {
            toolId: params.functionToolId,
            toolPolicies: {
              execute: {
                needsApproval: true,
              },
            },
          },
        ],
        canTransferTo: [params.secondarySubAgentId],
        canDelegateTo,
        dataComponents: [params.dataComponentId],
        artifactComponents: [params.artifactComponentId],
        skills: [
          {
            id: params.skillId,
            index: 0,
            alwaysLoaded: true,
          },
        ],
        stopWhen: {
          stepCountIs: 7,
        },
      },
      [params.secondarySubAgentId]: {
        ...createTestSubAgentData({ id: params.secondarySubAgentId, suffix: ' Secondary' }),
        type: 'internal',
        canUse: [],
      },
    },
    functionTools: {
      [params.functionToolId]: {
        id: params.functionToolId,
        name: 'Source Function Tool',
        description: 'Function tool for import testing',
        functionId: params.functionId,
      },
    },
    triggers: {
      webhook: {
        id: 'webhook',
        name: 'Webhook Trigger',
        description: 'Should not be imported',
        enabled: true,
        messageTemplate: 'Incoming message: {{message}}',
      },
    },
  };
};

const getProjectResourceCounts = async (tenantId: string, projectId: string) => {
  const scopes = { tenantId, projectId };
  const [tools, dataComponents, artifactComponents, externalAgents, functions, skills] =
    await Promise.all([
      listTools(manageDbClient)({ scopes, pagination: { page: 1, limit: 100 } }),
      listDataComponents(manageDbClient)({ scopes }),
      listArtifactComponents(manageDbClient)({ scopes }),
      listExternalAgents(manageDbClient)({ scopes }),
      listFunctions(manageDbClient)({ scopes }),
      listSkills(manageDbClient)({ scopes, pagination: { page: 1, limit: 100 } }),
    ]);

  return {
    tools: tools.data.length,
    dataComponents: dataComponents.length,
    artifactComponents: artifactComponents.length,
    externalAgents: externalAgents.length,
    functions: functions.length,
    skills: skills.data.length,
  };
};

const createSourceProjectDependencies = async (params: {
  tenantId: string;
  projectId: string;
  toolId: string;
  dataComponentId: string;
  artifactComponentId: string;
  externalAgentId: string;
  skillId: string;
  functionId: string;
  toolCredentialReferenceId?: string;
  externalCredentialReferenceId?: string;
}) => {
  await Promise.all([
    createTool(manageDbClient)({
      ...createTestToolData(params.toolId),
      tenantId: params.tenantId,
      projectId: params.projectId,
      credentialReferenceId: params.toolCredentialReferenceId,
    }),
    createDataComponent(manageDbClient)({
      ...createTestDataComponentData(params.dataComponentId),
      props: createTestDataComponentData(params.dataComponentId).props as any,
      tenantId: params.tenantId,
      projectId: params.projectId,
    }),
    createArtifactComponent(manageDbClient)({
      ...createTestArtifactComponentData(params.artifactComponentId),
      props: createTestArtifactComponentData(params.artifactComponentId).props as any,
      tenantId: params.tenantId,
      projectId: params.projectId,
    }),
    createExternalAgent(manageDbClient)({
      ...createTestExternalAgentData({
        id: params.externalAgentId,
        credentialReferenceId: params.externalCredentialReferenceId,
      }),
      tenantId: params.tenantId,
      projectId: params.projectId,
    }),
    createSkill(manageDbClient)({
      tenantId: params.tenantId,
      projectId: params.projectId,
      name: params.skillId,
      description: 'Import skill',
      content: 'Skill content',
      files: [],
      metadata: null,
    }),
    upsertFunction(manageDbClient)({
      scopes: { tenantId: params.tenantId, projectId: params.projectId },
      data: {
        id: params.functionId,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
            },
          },
        },
        executeCode: 'function run({ query }) { return { query }; }',
        dependencies: {},
      },
    }),
  ]);
};

describe('Import Agent Service Layer', () => {
  it('should import a full agent into another project by recreating missing project-scoped resources and skipping triggers', async () => {
    const tenantId = await createTestTenantWithOrg('service-import-agent');
    await createTestProject(manageDbClient, tenantId, sourceProjectId);
    await createTestProject(manageDbClient, tenantId, targetProjectId);

    const toolId = `tool-${generateId(6)}`;
    const dataComponentId = `data-component-${generateId(6)}`;
    const artifactComponentId = `artifact-component-${generateId(6)}`;
    const externalAgentId = `external-agent-${generateId(6)}`;
    const skillId = `skill-${generateId(6)}`;
    const functionId = `function-${generateId(6)}`;
    const functionToolId = `function-tool-${generateId(6)}`;
    const sourceAgentId = `source-agent-${generateId(6)}`;
    const importedAgentId = `imported-agent-${generateId(6)}`;
    const defaultSubAgentId = `sub-agent-${generateId(6)}`;
    const secondarySubAgentId = `sub-agent-${generateId(6)}`;
    const contextConfigId = `context-${generateId(6)}`;
    const scheduledTriggerId = `hourly-${generateId(6)}`;

    await createSourceProjectDependencies({
      tenantId,
      projectId: sourceProjectId,
      toolId,
      dataComponentId,
      artifactComponentId,
      externalAgentId,
      skillId,
      functionId,
    });

    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId: sourceProjectId },
      createSourceAgentDefinition({
        agentId: sourceAgentId,
        defaultSubAgentId,
        secondarySubAgentId,
        toolId,
        functionToolId,
        functionId,
        dataComponentId,
        artifactComponentId,
        externalAgentId,
        skillId,
        contextConfigId,
      })
    );

    await createScheduledTrigger(runDbClient)({
      id: scheduledTriggerId,
      tenantId,
      projectId: sourceProjectId,
      agentId: sourceAgentId,
      name: 'Hourly Trigger',
      description: 'Should not be imported',
      enabled: true,
      cronExpression: '0 * * * *',
      cronTimezone: 'UTC',
      messageTemplate: 'Scheduled: {{message}}',
      maxRetries: 1,
      retryDelaySeconds: 60,
      timeoutSeconds: 780,
    });

    const beforeCounts = await getProjectResourceCounts(tenantId, targetProjectId);

    const importedAgent = await importFullAgentServerSide(
      manageDbClient,
      manageDbClient
    )({
      scopes: { tenantId, projectId: targetProjectId },
      sourceProjectId,
      sourceAgentId,
      newAgentId: importedAgentId,
      newAgentName: 'Imported Agent',
    });

    const afterCounts = await getProjectResourceCounts(tenantId, targetProjectId);

    expect(importedAgent.data.id).toBe(importedAgentId);
    expect(importedAgent.data.name).toBe('Imported Agent');
    expect(importedAgent.data.defaultSubAgentId).toBe(defaultSubAgentId);
    expect(importedAgent.data.contextConfig?.id).toBe(contextConfigId);
    expect(importedAgent.data.functionTools?.[functionToolId]).toMatchObject({
      id: functionToolId,
      functionId,
    });
    expect(importedAgent.data.subAgents[defaultSubAgentId]?.canTransferTo).toContain(
      secondarySubAgentId
    );
    expect(importedAgent.data.subAgents[defaultSubAgentId]?.dataComponents).toContain(
      dataComponentId
    );
    expect(importedAgent.data.subAgents[defaultSubAgentId]?.artifactComponents).toContain(
      artifactComponentId
    );
    expect(importedAgent.warnings).toEqual([]);
    expect(beforeCounts).toEqual({
      tools: 0,
      dataComponents: 0,
      artifactComponents: 0,
      externalAgents: 0,
      functions: 0,
      skills: 0,
    });
    expect(afterCounts).toEqual({
      tools: 1,
      dataComponents: 1,
      artifactComponents: 1,
      externalAgents: 1,
      functions: 1,
      skills: 1,
    });
    expect(
      await listTriggers(manageDbClient)({
        scopes: { tenantId, projectId: targetProjectId, agentId: importedAgentId },
      })
    ).toHaveLength(0);
    expect(
      await listScheduledTriggers(runDbClient)({
        scopes: { tenantId, projectId: targetProjectId, agentId: importedAgentId },
      })
    ).toHaveLength(0);
  });

  it('should reuse identical target dependencies without increasing resource counts', async () => {
    const tenantId = await createTestTenantWithOrg('service-import-agent-reuse');
    await createTestProject(manageDbClient, tenantId, sourceProjectId);
    await createTestProject(manageDbClient, tenantId, targetProjectId);

    const toolId = `tool-${generateId(6)}`;
    const dataComponentId = `data-component-${generateId(6)}`;
    const artifactComponentId = `artifact-component-${generateId(6)}`;
    const externalAgentId = `external-agent-${generateId(6)}`;
    const skillId = `skill-${generateId(6)}`;
    const functionId = `function-${generateId(6)}`;
    const functionToolId = `function-tool-${generateId(6)}`;
    const sourceAgentId = `source-agent-${generateId(6)}`;
    const importedAgentId = `imported-agent-${generateId(6)}`;
    const defaultSubAgentId = `sub-agent-${generateId(6)}`;
    const secondarySubAgentId = `sub-agent-${generateId(6)}`;
    const contextConfigId = `context-${generateId(6)}`;

    await createSourceProjectDependencies({
      tenantId,
      projectId: sourceProjectId,
      toolId,
      dataComponentId,
      artifactComponentId,
      externalAgentId,
      skillId,
      functionId,
    });

    await createSourceProjectDependencies({
      tenantId,
      projectId: targetProjectId,
      toolId,
      dataComponentId,
      artifactComponentId,
      externalAgentId,
      skillId,
      functionId,
    });

    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId: sourceProjectId },
      createSourceAgentDefinition({
        agentId: sourceAgentId,
        defaultSubAgentId,
        secondarySubAgentId,
        toolId,
        functionToolId,
        functionId,
        dataComponentId,
        artifactComponentId,
        externalAgentId,
        skillId,
        contextConfigId,
      })
    );

    const beforeCounts = await getProjectResourceCounts(tenantId, targetProjectId);

    const importedAgent = await importFullAgentServerSide(
      manageDbClient,
      manageDbClient
    )({
      scopes: { tenantId, projectId: targetProjectId },
      sourceProjectId,
      sourceAgentId,
      newAgentId: importedAgentId,
    });

    const afterCounts = await getProjectResourceCounts(tenantId, targetProjectId);

    expect(importedAgent.data.id).toBe(importedAgentId);
    expect(beforeCounts).toEqual(afterCounts);
  });

  it('should disconnect missing credential-backed resources and return warnings', async () => {
    const tenantId = await createTestTenantWithOrg('service-import-agent-credentials');
    await createTestProject(manageDbClient, tenantId, sourceProjectId);
    await createTestProject(manageDbClient, tenantId, targetProjectId);

    const toolId = `tool-${generateId(6)}`;
    const dataComponentId = `data-component-${generateId(6)}`;
    const artifactComponentId = `artifact-component-${generateId(6)}`;
    const externalAgentId = `external-agent-${generateId(6)}`;
    const skillId = `skill-${generateId(6)}`;
    const functionId = `function-${generateId(6)}`;
    const functionToolId = `function-tool-${generateId(6)}`;
    const sourceAgentId = `source-agent-${generateId(6)}`;
    const importedAgentId = `imported-agent-${generateId(6)}`;
    const defaultSubAgentId = `sub-agent-${generateId(6)}`;
    const secondarySubAgentId = `sub-agent-${generateId(6)}`;
    const contextConfigId = `context-${generateId(6)}`;
    const toolCredentialReferenceId = `cred-ref-tool-${generateId(6)}`;
    const externalCredentialReferenceId = `cred-ref-external-${generateId(6)}`;

    await createCredentialReference(manageDbClient)({
      id: toolCredentialReferenceId,
      tenantId,
      projectId: sourceProjectId,
      name: 'Tool Credential',
      type: 'oauth',
      credentialStoreId: 'mock-store',
      retrievalParams: { connectionId: 'tool' },
    });
    await createCredentialReference(manageDbClient)({
      id: externalCredentialReferenceId,
      tenantId,
      projectId: sourceProjectId,
      name: 'External Agent Credential',
      type: 'oauth',
      credentialStoreId: 'mock-store',
      retrievalParams: { connectionId: 'external' },
    });

    await createSourceProjectDependencies({
      tenantId,
      projectId: sourceProjectId,
      toolId,
      dataComponentId,
      artifactComponentId,
      externalAgentId,
      skillId,
      functionId,
      toolCredentialReferenceId,
      externalCredentialReferenceId,
    });

    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId: sourceProjectId },
      createSourceAgentDefinition({
        agentId: sourceAgentId,
        defaultSubAgentId,
        secondarySubAgentId,
        toolId,
        functionToolId,
        functionId,
        dataComponentId,
        artifactComponentId,
        externalAgentId,
        skillId,
        contextConfigId,
      })
    );

    const importedAgent = await importFullAgentServerSide(
      manageDbClient,
      manageDbClient
    )({
      scopes: { tenantId, projectId: targetProjectId },
      sourceProjectId,
      sourceAgentId,
      newAgentId: importedAgentId,
    });

    const importedTool = await getToolById(manageDbClient)({
      scopes: { tenantId, projectId: targetProjectId },
      toolId,
    });
    const importedExternalAgent = await getExternalAgent(manageDbClient)({
      scopes: { tenantId, projectId: targetProjectId },
      externalAgentId,
    });

    expect(importedAgent.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'credential_missing',
          resourceType: 'tool',
          resourceId: toolId,
          credentialReferenceId: toolCredentialReferenceId,
        },
        {
          code: 'credential_missing',
          resourceType: 'externalAgent',
          resourceId: externalAgentId,
          credentialReferenceId: externalCredentialReferenceId,
        },
      ])
    );
    expect(importedTool?.credentialReferenceId).toBeNull();
    expect(importedExternalAgent?.credentialReferenceId).toBeNull();
  });

  it('should reject importing agents with team-agent delegations', async () => {
    const tenantId = await createTestTenantWithOrg('service-import-agent-team');
    await createTestProject(manageDbClient, tenantId, sourceProjectId);
    await createTestProject(manageDbClient, tenantId, targetProjectId);

    const toolId = `tool-${generateId(6)}`;
    const dataComponentId = `data-component-${generateId(6)}`;
    const artifactComponentId = `artifact-component-${generateId(6)}`;
    const externalAgentId = `external-agent-${generateId(6)}`;
    const skillId = `skill-${generateId(6)}`;
    const functionId = `function-${generateId(6)}`;
    const functionToolId = `function-tool-${generateId(6)}`;
    const sourceAgentId = `source-agent-${generateId(6)}`;
    const defaultSubAgentId = `sub-agent-${generateId(6)}`;
    const secondarySubAgentId = `sub-agent-${generateId(6)}`;
    const contextConfigId = `context-${generateId(6)}`;
    const teamAgentId = `team-agent-${generateId(6)}`;
    const teamSubAgentId = `team-sub-agent-${generateId(6)}`;

    await createSourceProjectDependencies({
      tenantId,
      projectId: sourceProjectId,
      toolId,
      dataComponentId,
      artifactComponentId,
      externalAgentId,
      skillId,
      functionId,
    });

    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId: sourceProjectId },
      createTeamAgentDefinition(teamAgentId, teamSubAgentId)
    );
    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId: sourceProjectId },
      createSourceAgentDefinition({
        agentId: sourceAgentId,
        defaultSubAgentId,
        secondarySubAgentId,
        toolId,
        functionToolId,
        functionId,
        dataComponentId,
        artifactComponentId,
        externalAgentId,
        skillId,
        contextConfigId,
        teamAgentId,
      })
    );

    const error = await importFullAgentServerSide(
      manageDbClient,
      manageDbClient
    )({
      scopes: { tenantId, projectId: targetProjectId },
      sourceProjectId,
      sourceAgentId,
      newAgentId: `imported-agent-${generateId(6)}`,
    }).catch((caughtError) => caughtError);

    expect(error).toBeInstanceOf(HTTPException);

    const response = (error as HTTPException).getResponse();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: 'Team-agent delegations cannot be imported across projects',
    });
  });

  it('should return 409 when a target dependency exists with a different configuration', async () => {
    const tenantId = await createTestTenantWithOrg('service-import-agent-conflict');
    await createTestProject(manageDbClient, tenantId, sourceProjectId);
    await createTestProject(manageDbClient, tenantId, targetProjectId);

    const toolId = `tool-${generateId(6)}`;
    const dataComponentId = `data-component-${generateId(6)}`;
    const artifactComponentId = `artifact-component-${generateId(6)}`;
    const externalAgentId = `external-agent-${generateId(6)}`;
    const skillId = `skill-${generateId(6)}`;
    const functionId = `function-${generateId(6)}`;
    const functionToolId = `function-tool-${generateId(6)}`;
    const sourceAgentId = `source-agent-${generateId(6)}`;
    const defaultSubAgentId = `sub-agent-${generateId(6)}`;
    const secondarySubAgentId = `sub-agent-${generateId(6)}`;
    const contextConfigId = `context-${generateId(6)}`;

    await createSourceProjectDependencies({
      tenantId,
      projectId: sourceProjectId,
      toolId,
      dataComponentId,
      artifactComponentId,
      externalAgentId,
      skillId,
      functionId,
    });

    await createTool(manageDbClient)({
      ...createTestToolData(toolId, ' 9'),
      tenantId,
      projectId: targetProjectId,
    });

    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId: sourceProjectId },
      createSourceAgentDefinition({
        agentId: sourceAgentId,
        defaultSubAgentId,
        secondarySubAgentId,
        toolId,
        functionToolId,
        functionId,
        dataComponentId,
        artifactComponentId,
        externalAgentId,
        skillId,
        contextConfigId,
      })
    );

    const error = await importFullAgentServerSide(
      manageDbClient,
      manageDbClient
    )({
      scopes: { tenantId, projectId: targetProjectId },
      sourceProjectId,
      sourceAgentId,
      newAgentId: `imported-agent-${generateId(6)}`,
    }).catch((caughtError) => caughtError);

    expect(error).toBeInstanceOf(HTTPException);

    const response = (error as HTTPException).getResponse();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: `Tool '${toolId}' already exists in target project with different configuration`,
    });
  });
});
