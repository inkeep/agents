import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertSubAgentFunctionToolRelationMock: vi.fn().mockResolvedValue({ id: 'rel-1' }),
}));

vi.mock('../../validation/agentFull', () => ({
  validateAndTypeAgentData: vi.fn((data) => data),
  validateAgentStructure: vi.fn(),
}));

vi.mock('../../data-access/manage/agents', () => ({
  deleteAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  getAgentById: vi.fn(() => vi.fn().mockResolvedValue({ id: 'agent-1', models: null })),
  getFullAgentDefinition: vi.fn(() => vi.fn().mockResolvedValue({ id: 'agent-1', subAgents: {} })),
  getFullAgentDefinitionWithRelationIds: vi.fn(() =>
    vi.fn().mockResolvedValue({ id: 'agent-1', subAgents: {} })
  ),
  updateAgent: vi.fn(() => vi.fn().mockResolvedValue({ id: 'agent-1' })),
  upsertAgent: vi.fn(() => vi.fn().mockResolvedValue({ id: 'agent-1' })),
}));

vi.mock('../../data-access/manage/functionTools', () => ({
  deleteFunctionTool: vi.fn(() => vi.fn().mockResolvedValue(true)),
  listFunctionTools: vi.fn(() =>
    vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } })
  ),
  upsertFunctionTool: vi.fn(() => vi.fn().mockResolvedValue({ id: 'ft-1' })),
  upsertSubAgentFunctionToolRelation: vi.fn(() => mocks.upsertSubAgentFunctionToolRelationMock),
}));

vi.mock('../../data-access/manage/functions', () => ({
  upsertFunction: vi.fn(() => vi.fn().mockResolvedValue({ id: 'fn-1' })),
}));

vi.mock('../../data-access/manage/subAgents', () => ({
  deleteSubAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  listSubAgents: vi.fn(() => vi.fn().mockResolvedValue([{ id: 'sub-1' }])),
  upsertSubAgent: vi.fn(() => vi.fn().mockResolvedValue({ id: 'sub-1' })),
}));

vi.mock('../../data-access/manage/subAgentRelations', () => ({
  createSubAgentRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
  deleteAgentRelationsByAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  deleteAgentToolRelationByAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  upsertSubAgentRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
}));

vi.mock('../../data-access/manage/subAgentExternalAgentRelations', () => ({
  deleteSubAgentExternalAgentRelation: vi.fn(() => vi.fn().mockResolvedValue(true)),
  getSubAgentExternalAgentRelationsByAgent: vi.fn(() => vi.fn().mockResolvedValue([])),
  upsertSubAgentExternalAgentRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
}));

vi.mock('../../data-access/manage/subAgentTeamAgentRelations', () => ({
  deleteSubAgentTeamAgentRelation: vi.fn(() => vi.fn().mockResolvedValue(true)),
  getSubAgentTeamAgentRelationsByAgent: vi.fn(() => vi.fn().mockResolvedValue([])),
  upsertSubAgentTeamAgentRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
}));

vi.mock('../../data-access/manage/tools', () => ({
  upsertSubAgentToolRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
}));

vi.mock('../../data-access/manage/contextConfigs', () => ({
  upsertContextConfig: vi.fn(() => vi.fn().mockResolvedValue({ id: 'ctx-1' })),
}));

vi.mock('../../data-access/manage/triggers', () => ({
  deleteTrigger: vi.fn(() => vi.fn().mockResolvedValue(true)),
  listTriggers: vi.fn(() => vi.fn().mockResolvedValue([])),
  upsertTrigger: vi.fn(() => vi.fn().mockResolvedValue({ id: 'tr-1' })),
}));

vi.mock('../../data-access/manage/dataComponents', () => ({
  associateDataComponentWithAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  deleteAgentDataComponentRelationByAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  upsertAgentDataComponentRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
}));

vi.mock('../../data-access/manage/artifactComponents', () => ({
  associateArtifactComponentWithAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  deleteAgentArtifactComponentRelationByAgent: vi.fn(() => vi.fn().mockResolvedValue(true)),
  upsertAgentArtifactComponentRelation: vi.fn(() => vi.fn().mockResolvedValue({ id: 'rel' })),
}));

import { updateFullAgentServerSide } from '../../data-access/manage/agentFull';

describe('agentFull update - function tool toolPolicies', () => {
  it('passes toolPolicies when upserting sub-agent function tool relations', async () => {
    const deleteWhereMock = vi.fn().mockResolvedValue(null);
    const db = {
      delete: vi.fn(() => ({
        where: deleteWhereMock,
      })),
      query: {
        projects: { findFirst: vi.fn().mockResolvedValue(null) },
        subAgents: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as any;

    const toolPolicies = { '*': { needsApproval: true } };

    const agentData: any = {
      id: 'agent-1',
      name: 'Agent',
      defaultSubAgentId: 'sub-1',
      subAgents: {
        'sub-1': {
          id: 'sub-1',
          name: 'Sub',
          description: '',
          prompt: '',
          canTransferTo: [],
          canDelegateTo: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              toolId: 'ft-1',
              toolSelection: null,
              headers: null,
              toolPolicies,
              agentToolRelationId: 'rel-1',
            },
          ],
        },
      },
      functionTools: {
        'ft-1': { id: 'ft-1', name: 'My tool', description: '', functionId: 'fn-1' },
      },
      functions: {
        'fn-1': {
          id: 'fn-1',
          name: 'My tool',
          description: '',
          executeCode: 'return 1',
          inputSchema: {},
          dependencies: {},
        },
      },
    };

    await updateFullAgentServerSide(db)({ tenantId: 't', projectId: 'p' }, agentData);

    expect(mocks.upsertSubAgentFunctionToolRelationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subAgentId: 'sub-1',
        functionToolId: 'ft-1',
        toolPolicies,
        relationId: 'rel-1',
      })
    );
  });
});
