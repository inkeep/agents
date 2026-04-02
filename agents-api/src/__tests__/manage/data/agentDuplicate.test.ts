import {
  createArtifactComponent,
  createDataComponent,
  createExternalAgent,
  createFullAgentServerSide,
  createScheduledTrigger,
  createSkill,
  createTool,
  duplicateFullAgentServerSide,
  type FullAgentDefinition,
  generateId,
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

const projectId = 'default';

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
  teamAgentId: string;
  skillId: string;
  contextConfigId: string;
}): FullAgentDefinition => ({
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
      canDelegateTo: [
        params.secondarySubAgentId,
        {
          externalAgentId: params.externalAgentId,
          headers: { 'X-External': 'source' },
        },
        {
          agentId: params.teamAgentId,
          headers: { 'X-Team': 'source' },
        },
      ],
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
      description: 'Function tool for duplicate testing',
      functionId: params.functionId,
    },
  },
  triggers: {
    webhook: {
      id: 'webhook',
      name: 'Webhook Trigger',
      description: 'Should not be duplicated',
      enabled: true,
      messageTemplate: 'Incoming message: {{message}}',
    },
  },
});

const getProjectResourceCounts = async (tenantId: string) => {
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

describe('Duplicate Agent Service Layer', () => {
  it('should duplicate a full agent without copying project-scoped resources or triggers', async () => {
    const tenantId = await createTestTenantWithOrg('service-duplicate-agent');
    await createTestProject(manageDbClient, tenantId, projectId);

    const toolId = `tool-${generateId(6)}`;
    const dataComponentId = `data-component-${generateId(6)}`;
    const artifactComponentId = `artifact-component-${generateId(6)}`;
    const externalAgentId = `external-agent-${generateId(6)}`;
    const skillId = `skill-${generateId(6)}`;
    const functionId = `function-${generateId(6)}`;
    const functionToolId = `function-tool-${generateId(6)}`;
    const sourceAgentId = `source-agent-${generateId(6)}`;
    const duplicateAgentId = `duplicate-agent-${generateId(6)}`;
    const defaultSubAgentId = `sub-agent-${generateId(6)}`;
    const secondarySubAgentId = `sub-agent-${generateId(6)}`;
    const contextConfigId = `context-${generateId(6)}`;
    const teamAgentId = `team-agent-${generateId(6)}`;
    const teamSubAgentId = `team-sub-agent-${generateId(6)}`;
    const scheduledTriggerId = `hourly-${generateId(6)}`;

    await Promise.all([
      createTool(manageDbClient)({
        ...createTestToolData(toolId),
        tenantId,
        projectId,
      }),
      createDataComponent(manageDbClient)({
        ...createTestDataComponentData(dataComponentId),
        props: createTestDataComponentData(dataComponentId).props as any,
        tenantId,
        projectId,
      }),
      createArtifactComponent(manageDbClient)({
        ...createTestArtifactComponentData(artifactComponentId),
        props: createTestArtifactComponentData(artifactComponentId).props as any,
        tenantId,
        projectId,
      }),
      createExternalAgent(manageDbClient)({
        ...createTestExternalAgentData({ id: externalAgentId }),
        tenantId,
        projectId,
      }),
      createSkill(manageDbClient)({
        tenantId,
        projectId,
        name: skillId,
        description: 'Duplicate skill',
        content: 'Skill content',
        files: [],
        metadata: null,
      }),
      upsertFunction(manageDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: functionId,
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
      createFullAgentServerSide(manageDbClient)(
        { tenantId, projectId },
        createTeamAgentDefinition(teamAgentId, teamSubAgentId)
      ),
    ]);

    const sourceAgent = await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId },
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
        teamAgentId,
        skillId,
        contextConfigId,
      })
    );

    await createScheduledTrigger(runDbClient)({
      id: scheduledTriggerId,
      tenantId,
      projectId,
      agentId: sourceAgentId,
      name: 'Hourly Trigger',
      description: 'Should not be duplicated',
      enabled: true,
      cronExpression: '0 * * * *',
      cronTimezone: 'UTC',
      messageTemplate: 'Scheduled: {{message}}',
      maxRetries: 1,
      retryDelaySeconds: 60,
      timeoutSeconds: 780,
    });

    const beforeCounts = await getProjectResourceCounts(tenantId);

    const duplicatedAgent = await duplicateFullAgentServerSide(manageDbClient)({
      scopes: { tenantId, projectId, agentId: sourceAgentId },
      newAgentId: duplicateAgentId,
      newAgentName: 'Duplicated Agent',
    });

    const afterCounts = await getProjectResourceCounts(tenantId);
    const sourcePrimarySubAgent = sourceAgent.subAgents[defaultSubAgentId] as any;
    const duplicatePrimarySubAgent = duplicatedAgent.subAgents[defaultSubAgentId] as any;
    const sourceToolRelation = sourcePrimarySubAgent.canUse.find(
      (item: any) => item.toolId === toolId
    );
    const duplicateToolRelation = duplicatePrimarySubAgent.canUse.find(
      (item: any) => item.toolId === toolId
    );
    const sourceExternalRelation = sourcePrimarySubAgent.canDelegateTo.find(
      (item: any) => typeof item === 'object' && item.externalAgentId === externalAgentId
    );
    const duplicateExternalRelation = duplicatePrimarySubAgent.canDelegateTo.find(
      (item: any) => typeof item === 'object' && item.externalAgentId === externalAgentId
    );
    const sourceTeamRelation = sourcePrimarySubAgent.canDelegateTo.find(
      (item: any) => typeof item === 'object' && item.agentId === teamAgentId
    );
    const duplicateTeamRelation = duplicatePrimarySubAgent.canDelegateTo.find(
      (item: any) => typeof item === 'object' && item.agentId === teamAgentId
    );

    expect(duplicatedAgent.id).toBe(duplicateAgentId);
    expect(duplicatedAgent.name).toBe('Duplicated Agent');
    expect(duplicatedAgent.defaultSubAgentId).toBe(defaultSubAgentId);
    expect(duplicatedAgent.contextConfig?.id).toBe(contextConfigId);
    expect(duplicatedAgent.functionTools?.[functionToolId]).toMatchObject({
      id: functionToolId,
      functionId,
    });
    expect(duplicatePrimarySubAgent.canTransferTo).toContain(secondarySubAgentId);
    expect(duplicatePrimarySubAgent.dataComponents).toContain(dataComponentId);
    expect(duplicatePrimarySubAgent.artifactComponents).toContain(artifactComponentId);
    expect(duplicatePrimarySubAgent.canUse).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolId,
          toolSelection: ['testTool'],
          headers: { Authorization: 'Bearer test-token' },
        }),
        expect.objectContaining({
          toolId: functionToolId,
        }),
      ])
    );
    expect(duplicatePrimarySubAgent.canDelegateTo).toEqual(
      expect.arrayContaining([
        secondarySubAgentId,
        expect.objectContaining({
          externalAgentId,
          headers: { 'X-External': 'source' },
        }),
        expect.objectContaining({
          agentId: teamAgentId,
          headers: { 'X-Team': 'source' },
        }),
      ])
    );
    expect(duplicatePrimarySubAgent.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: skillId,
          index: 0,
          alwaysLoaded: true,
        }),
      ])
    );
    expect(duplicateToolRelation.agentToolRelationId).not.toBe(
      sourceToolRelation.agentToolRelationId
    );
    expect(duplicateExternalRelation.subAgentExternalAgentRelationId).not.toBe(
      sourceExternalRelation.subAgentExternalAgentRelationId
    );
    expect(duplicateTeamRelation.subAgentTeamAgentRelationId).not.toBe(
      sourceTeamRelation.subAgentTeamAgentRelationId
    );
    expect(afterCounts).toEqual(beforeCounts);
    expect(
      await listTriggers(manageDbClient)({
        scopes: { tenantId, projectId, agentId: duplicateAgentId },
      })
    ).toHaveLength(0);
    expect(
      await listScheduledTriggers(runDbClient)({
        scopes: { tenantId, projectId, agentId: duplicateAgentId },
      })
    ).toHaveLength(0);
  });

  it('should default the duplicated agent name when a new name is not provided', async () => {
    const tenantId = await createTestTenantWithOrg('service-duplicate-agent-default-name');
    await createTestProject(manageDbClient, tenantId, projectId);

    const agentId = `source-agent-${generateId(6)}`;
    const subAgentId = `sub-agent-${generateId(6)}`;

    await createFullAgentServerSide(manageDbClient)(
      { tenantId, projectId },
      {
        id: agentId,
        name: 'Source Agent',
        description: 'A source agent',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            ...createTestSubAgentData({ id: subAgentId }),
            type: 'internal',
            canUse: [],
          },
        },
      }
    );

    const duplicatedAgent = await duplicateFullAgentServerSide(manageDbClient)({
      scopes: { tenantId, projectId, agentId },
      newAgentId: `duplicate-agent-${generateId(6)}`,
    });

    expect(duplicatedAgent.name).toBe('Source Agent (Copy)');
  });
});
