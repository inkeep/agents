import type { DuplicateAgentRequest, FullAgentDefinition } from '../../types/entities';
import { validateAndTypeAgentData } from '../../validation/agentFull';

type AgentCopySource = FullAgentDefinition & {
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type InternalTransferTarget = string | { subAgentId: string };
type ExternalDelegateTarget = {
  externalAgentId: string;
  headers?: Record<string, string> | null;
  subAgentExternalAgentRelationId?: string;
};
type TeamDelegateTarget = {
  agentId: string;
  headers?: Record<string, string> | null;
  subAgentTeamAgentRelationId?: string;
};
type DelegateTarget = string | ExternalDelegateTarget | TeamDelegateTarget;

export interface ReferencedDependencyIds {
  toolIds: Set<string>;
  externalAgentIds: Set<string>;
  dataComponentIds: Set<string>;
  artifactComponentIds: Set<string>;
  skillIds: Set<string>;
  functionIds: Set<string>;
  hasTeamAgentDelegation: boolean;
}

const NON_PORTABLE_ROOT_KEYS = [
  'tools',
  'externalAgents',
  'teamAgents',
  'functions',
  'triggers',
] as const;

const toOptionalValue = <T>(value: T | null | undefined): T | undefined =>
  value === null || value === undefined ? undefined : value;

const normalizeTransferTargets = (targets?: InternalTransferTarget[]) =>
  targets?.map((target) => (typeof target === 'string' ? target : target.subAgentId));

const normalizeDelegateTargets = (targets?: DelegateTarget[]) =>
  targets?.map((target) => {
    if (typeof target === 'string') {
      return target;
    }

    if ('externalAgentId' in target) {
      const { subAgentExternalAgentRelationId: _relationId, ...delegateTarget } = target;
      return delegateTarget;
    }

    const { subAgentTeamAgentRelationId: _relationId, ...delegateTarget } = target;
    return delegateTarget;
  });

export const buildCopiedAgentDefinition = (
  sourceAgent: AgentCopySource,
  params: DuplicateAgentRequest
): FullAgentDefinition => {
  const copiedAgent = structuredClone(sourceAgent) as AgentCopySource;

  copiedAgent.id = params.newAgentId;
  copiedAgent.name = params.newAgentName ?? `${sourceAgent.name} (Copy)`;
  copiedAgent.defaultSubAgentId = toOptionalValue(copiedAgent.defaultSubAgentId);

  for (const key of NON_PORTABLE_ROOT_KEYS) {
    delete copiedAgent[key];
  }

  copiedAgent.subAgents = Object.fromEntries(
    Object.entries(copiedAgent.subAgents).map(([subAgentId, subAgent]) => [
      subAgentId,
      {
        ...subAgent,
        type: 'internal' as const,
        prompt: toOptionalValue(subAgent.prompt),
        models: toOptionalValue(subAgent.models),
        stopWhen: toOptionalValue(subAgent.stopWhen),
        canUse: (subAgent.canUse ?? []).map(({ agentToolRelationId: _relationId, ...canUse }) => ({
          ...canUse,
        })),
        canTransferTo: normalizeTransferTargets(
          subAgent.canTransferTo as InternalTransferTarget[] | undefined
        ),
        canDelegateTo: normalizeDelegateTargets(
          subAgent.canDelegateTo as DelegateTarget[] | undefined
        ),
        skills: subAgent.skills?.map((skill) => ({
          id: skill.id,
          index: skill.index,
          alwaysLoaded: toOptionalValue(skill.alwaysLoaded),
        })),
      },
    ])
  );

  return validateAndTypeAgentData(copiedAgent);
};

export const collectReferencedDependencyIds = (
  sourceAgent: FullAgentDefinition
): ReferencedDependencyIds => {
  const functionToolIds = new Set(Object.keys(sourceAgent.functionTools ?? {}));
  const toolIds = new Set<string>();
  const externalAgentIds = new Set<string>();
  const dataComponentIds = new Set<string>();
  const artifactComponentIds = new Set<string>();
  const skillIds = new Set<string>();
  const functionIds = new Set<string>();
  let hasTeamAgentDelegation = false;

  for (const subAgent of Object.values(sourceAgent.subAgents)) {
    for (const canUseItem of subAgent.canUse ?? []) {
      if (!functionToolIds.has(canUseItem.toolId)) {
        toolIds.add(canUseItem.toolId);
      }
    }

    for (const delegateTarget of subAgent.canDelegateTo ?? []) {
      if (typeof delegateTarget === 'string') {
        continue;
      }

      if ('externalAgentId' in delegateTarget) {
        externalAgentIds.add(delegateTarget.externalAgentId);
        continue;
      }

      hasTeamAgentDelegation = true;
    }

    for (const dataComponentId of subAgent.dataComponents ?? []) {
      dataComponentIds.add(dataComponentId);
    }

    for (const artifactComponentId of subAgent.artifactComponents ?? []) {
      artifactComponentIds.add(artifactComponentId);
    }

    for (const skill of subAgent.skills ?? []) {
      skillIds.add(skill.id);
    }
  }

  for (const functionTool of Object.values(sourceAgent.functionTools ?? {})) {
    functionIds.add(functionTool.functionId);
  }

  return {
    toolIds,
    externalAgentIds,
    dataComponentIds,
    artifactComponentIds,
    skillIds,
    functionIds,
    hasTeamAgentDelegation,
  };
};
