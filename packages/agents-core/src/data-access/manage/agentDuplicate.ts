import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import type {
  DuplicateAgentRequest,
  FullAgentDefinition,
  FullAgentSelect,
} from '../../types/entities';
import type { AgentScopeConfig, ProjectScopeConfig } from '../../types/utility';
import { createApiError, throwIfUniqueConstraintError } from '../../utils/error';
import { type AgentLogger, createFullAgentServerSide } from './agentFull';
import { getAgentById, getFullAgentDefinition } from './agents';

interface DuplicateAgentParams extends DuplicateAgentRequest {
  scopes: AgentScopeConfig;
}

const defaultLogger: AgentLogger = {
  info: () => {},
  error: () => {},
};

const toOptionalValue = <T>(value: T | null | undefined): T | undefined =>
  value === null || value === undefined ? undefined : value;

const buildDuplicateAgentDefinition = (
  sourceAgent: FullAgentDefinition & {
    createdAt?: string | Date;
    updatedAt?: string | Date;
  },
  params: DuplicateAgentRequest
): FullAgentDefinition => {
  const duplicateName = params.newAgentName ?? `${sourceAgent.name} (Copy)`;

  const subAgents = Object.fromEntries(
    Object.entries(sourceAgent.subAgents).map(([subAgentId, subAgent]) => {
      const subAgentSkills = Array.isArray((subAgent as { skills?: unknown[] }).skills)
        ? ((
            subAgent as {
              skills: Array<{ id: string; index: number; alwaysLoaded?: boolean | null }>;
            }
          ).skills.map((skill) => ({
            id: skill.id,
            index: skill.index,
            alwaysLoaded: toOptionalValue(skill.alwaysLoaded),
          })) ?? [])
        : undefined;

      const canUse = (subAgent.canUse ?? []).map(
        ({ agentToolRelationId: _agentToolRelationId, ...canUseItem }) => ({
          ...canUseItem,
        })
      );

      const canDelegateTo = toOptionalValue(subAgent.canDelegateTo)?.map((delegateTarget) => {
        if (typeof delegateTarget === 'string') {
          return delegateTarget;
        }

        if ('externalAgentId' in delegateTarget) {
          return {
            externalAgentId: delegateTarget.externalAgentId,
            headers: toOptionalValue(delegateTarget.headers),
          };
        }

        return {
          agentId: delegateTarget.agentId,
          headers: toOptionalValue(delegateTarget.headers),
        };
      });

      return [
        subAgentId,
        {
          id: subAgentId,
          type: 'internal' as const,
          name: subAgent.name,
          description: toOptionalValue(subAgent.description),
          prompt: toOptionalValue(subAgent.prompt),
          models: toOptionalValue(subAgent.models),
          stopWhen: toOptionalValue(subAgent.stopWhen),
          canUse,
          canTransferTo: toOptionalValue(subAgent.canTransferTo) ?? [],
          canDelegateTo,
          dataComponents: toOptionalValue(subAgent.dataComponents),
          artifactComponents: toOptionalValue(subAgent.artifactComponents),
          skills: subAgentSkills,
        },
      ];
    })
  );

  const functionTools = sourceAgent.functionTools
    ? Object.fromEntries(
        Object.entries(sourceAgent.functionTools).map(([functionToolId, functionTool]) => [
          functionToolId,
          {
            id: functionToolId,
            name: functionTool.name,
            description: toOptionalValue(functionTool.description),
            functionId: functionTool.functionId,
          },
        ])
      )
    : undefined;

  return {
    id: params.newAgentId,
    name: duplicateName,
    description: toOptionalValue(sourceAgent.description),
    defaultSubAgentId: toOptionalValue(sourceAgent.defaultSubAgentId),
    contextConfig: sourceAgent.contextConfig
      ? {
          id: sourceAgent.contextConfig.id,
          headersSchema: toOptionalValue(sourceAgent.contextConfig.headersSchema),
          contextVariables: toOptionalValue(sourceAgent.contextConfig.contextVariables),
        }
      : undefined,
    statusUpdates: toOptionalValue(sourceAgent.statusUpdates),
    models: toOptionalValue(sourceAgent.models),
    stopWhen: toOptionalValue(sourceAgent.stopWhen),
    prompt: toOptionalValue(sourceAgent.prompt),
    executionMode: toOptionalValue(
      (sourceAgent as { executionMode?: 'classic' | 'durable' }).executionMode
    ),
    subAgents,
    functionTools,
  };
};

export const duplicateFullAgentServerSide =
  (db: AgentsManageDatabaseClient, logger: AgentLogger = defaultLogger) =>
  async (params: DuplicateAgentParams): Promise<FullAgentSelect> => {
    const {
      scopes: { tenantId, projectId, agentId },
      newAgentId,
      newAgentName,
    } = params;

    if (newAgentId === agentId) {
      throw createApiError({
        code: 'bad_request',
        message: 'New agent ID must differ from source agent ID',
      });
    }

    const sourceAgent = await getFullAgentDefinition(db)({
      scopes: { tenantId, projectId, agentId },
    });

    if (!sourceAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    const targetAgent = await getAgentById(db)({
      scopes: { tenantId, projectId, agentId: newAgentId },
    });

    if (targetAgent) {
      throw createApiError({
        code: 'conflict',
        message: `An agent with ID '${newAgentId}' already exists`,
      });
    }

    const targetScopes: ProjectScopeConfig = { tenantId, projectId };
    const duplicateAgentDefinition = buildDuplicateAgentDefinition(sourceAgent, {
      newAgentId,
      newAgentName,
    });

    try {
      return (await createFullAgentServerSide(db, logger)(
        targetScopes,
        duplicateAgentDefinition
      )) as FullAgentSelect;
    } catch (error) {
      throwIfUniqueConstraintError(error, `An agent with ID '${newAgentId}' already exists`);
      throw error;
    }
  };
