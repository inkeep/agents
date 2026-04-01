import { join } from 'node:path';
import { FullAgentAgentInsertSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import { asRecord } from '../collector-common';
import {
  collectContextTemplateReferences,
  collectSubAgentDependencyReferenceOverrides,
} from '../collector-reference-helpers';
import type { GenerationTask } from '../generation-types';
import {
  addResolvedReferenceImports,
  resolveReferenceBinding,
  resolveReferenceBindingsFromIds,
  toReferenceNameRecord,
} from '../reference-resolution';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addValueToObject,
  buildComponentFileName,
  codeReference,
  collectTemplateVariableNames,
  createArrayGetterValue,
  createReferenceGetterValue,
  formatTemplate,
  hasReferences,
  isPlainObject,
  resolveReferenceName,
  toCamelCase,
} from '../utils';
import {
  collectCanDelegateToReferences,
  collectCanUseReferences,
  collectSkills,
  type NormalizedCanDelegateToEntry,
  type NormalizedCanUseEntry,
  type NormalizedDelegateTargetType,
  type NormalizedSkillEntry,
  resolveSubAgentName,
  resolveSubAgentVariableName,
} from './helpers/sub-agent';

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  tools: ReferenceNameByIdSchema.optional(),
  subAgents: ReferenceNameByIdSchema.optional(),
  agents: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
  dataComponents: ReferenceNameByIdSchema.optional(),
  artifactComponents: ReferenceNameByIdSchema.optional(),
});

const ReferencePathOverridesSchema = z.object({
  tools: ReferenceNameByIdSchema.optional(),
  subAgents: ReferenceNameByIdSchema.optional(),
  agents: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
});

const ContextTemplateReferenceSchema = z.object({
  name: z.string().nonempty(),
  local: z.boolean().optional(),
});

const MySchema = FullAgentAgentInsertSchema.pick({
  id: true,
  prompt: true,
  name: true,
  description: true,
  stopWhen: true,
});

const BaseSubAgentSchema = z.strictObject({
  ...MySchema.shape,
  prompt: z.preprocess((v) => v || undefined, MySchema.shape.prompt),
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  stopWhen: z.preprocess((v) => v ?? undefined, MySchema.shape.stopWhen),
  models: z.preprocess((v) => v ?? undefined, z.looseObject({}).optional()),
  skills: z.array(z.unknown()).optional(),
  canUse: z.array(z.unknown()).optional(),
  canDelegateTo: z.array(z.unknown()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
  referencePathOverrides: ReferencePathOverridesSchema.optional(),
  contextConfigId: z.string().nonempty().optional(),
  contextConfigReference: ContextTemplateReferenceSchema.optional(),
  contextConfigHeadersReference: ContextTemplateReferenceSchema.optional(),
});

const SubAgentSchema = BaseSubAgentSchema.transform((data) => ({
  ...data,
  normalizedCanUse: normalizeCanUseEntries(data.canUse),
  normalizedCanDelegateTo: normalizeCanDelegateToEntries(data.canDelegateTo),
  normalizedSkills: normalizeSkills(data.skills),
}));

type SubAgentInput = z.input<typeof SubAgentSchema>;
type SubAgentOutput = z.output<typeof SubAgentSchema>;

function normalizeCanUseEntries(canUse?: unknown[]): NormalizedCanUseEntry[] {
  if (!Array.isArray(canUse)) {
    return [];
  }

  const entries: NormalizedCanUseEntry[] = [];
  for (const item of canUse) {
    if (typeof item === 'string') {
      entries.push({ toolId: item });
      continue;
    }

    if (!isPlainObject(item) || typeof item.toolId !== 'string') {
      continue;
    }

    const selectedTools =
      Array.isArray(item.toolSelection) && item.toolSelection.length
        ? item.toolSelection
        : Array.isArray(item.selectedTools) && item.selectedTools.length
          ? item.selectedTools
          : undefined;
    const headers =
      isPlainObject(item.headers) && Object.keys(item.headers).length > 0
        ? item.headers
        : undefined;
    const toolPolicies =
      isPlainObject(item.toolPolicies) && Object.keys(item.toolPolicies).length > 0
        ? item.toolPolicies
        : undefined;

    entries.push({
      toolId: item.toolId,
      ...(selectedTools && { selectedTools }),
      ...(headers && { headers }),
      ...(toolPolicies && { toolPolicies }),
    });
  }

  return entries;
}

function normalizeCanDelegateToEntries(canDelegateTo?: unknown[]): NormalizedCanDelegateToEntry[] {
  if (!Array.isArray(canDelegateTo)) {
    return [];
  }

  const entries: NormalizedCanDelegateToEntry[] = [];
  for (const item of canDelegateTo) {
    if (typeof item === 'string') {
      entries.push({ id: item });
      continue;
    }

    if (!isPlainObject(item)) {
      continue;
    }

    const headers =
      isPlainObject(item.headers) && Object.keys(item.headers).length > 0
        ? item.headers
        : undefined;
    const addEntry = (type: NormalizedDelegateTargetType, id: unknown) => {
      if (typeof id !== 'string') {
        return;
      }

      entries.push({
        id,
        type,
        ...(headers && { headers }),
      });
    };

    addEntry('subAgents', item.subAgentId);
    addEntry('agents', item.agentId);
    addEntry('externalAgents', item.externalAgentId);
  }

  return entries;
}

function normalizeSkills(skills?: unknown[]): NormalizedSkillEntry[] {
  if (!Array.isArray(skills)) {
    return [];
  }

  const normalizedSkills: NormalizedSkillEntry[] = [];
  for (const skill of skills) {
    if (typeof skill === 'string') {
      normalizedSkills.push(skill);
      continue;
    }

    if (!isPlainObject(skill)) {
      continue;
    }

    const skillId =
      typeof skill.id === 'string'
        ? skill.id
        : typeof skill.skillId === 'string'
          ? skill.skillId
          : undefined;
    if (!skillId) {
      continue;
    }

    normalizedSkills.push({
      id: skillId,
      ...(typeof skill.index === 'number' && Number.isInteger(skill.index)
        ? { index: skill.index }
        : {}),
      ...(typeof skill.alwaysLoaded === 'boolean' ? { alwaysLoaded: skill.alwaysLoaded } : {}),
    });
  }

  return normalizedSkills;
}

export function generateSubAgentDefinition({
  subAgentId,
  ...data
}: SubAgentInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: SubAgentSchema,
    factory: {
      importName: 'subAgent',
      variableName: (parsed) => resolveSubAgentVariableName(parsed.id, parsed.name),
    },
    render({ parsed, sourceFile, configObject }) {
      const subAgentVariableName = resolveSubAgentVariableName(parsed.id, parsed.name);
      const reservedReferenceNames = new Set([subAgentVariableName]);

      const promptTemplateVariables =
        typeof parsed.prompt === 'string' ? collectTemplateVariableNames(parsed.prompt) : [];
      const hasContextTemplateVariables = promptTemplateVariables.some(
        (variableName) => !variableName.startsWith('headers.')
      );
      const hasHeadersTemplateVariables = promptTemplateVariables.some((variableName) =>
        variableName.startsWith('headers.')
      );
      let contextReferenceName: string | undefined;
      let headersReferenceName: string | undefined;
      if (parsed.contextConfigId) {
        const contextReferences = [];
        if (hasContextTemplateVariables) {
          const contextReference = resolveReferenceBinding(
            {
              id: `${parsed.contextConfigId}:context`,
              importName:
                parsed.contextConfigReference?.name ?? toCamelCase(parsed.contextConfigId),
              modulePath: parsed.contextConfigId,
              local: parsed.contextConfigReference?.local === true,
              conflictSuffix: 'ContextConfig',
            },
            {
              reservedNames: reservedReferenceNames,
            }
          );
          contextReferenceName = contextReference.localName;
          contextReferences.push(contextReference);
        }

        if (hasHeadersTemplateVariables) {
          const headersReference = resolveReferenceBinding(
            {
              id: `${parsed.contextConfigId}:headers`,
              importName:
                parsed.contextConfigHeadersReference?.name ??
                `${toCamelCase(parsed.contextConfigId)}Headers`,
              modulePath: parsed.contextConfigId,
              local: parsed.contextConfigHeadersReference?.local === true,
              conflictSuffix: 'Headers',
            },
            {
              reservedNames: reservedReferenceNames,
            }
          );
          headersReferenceName = headersReference.localName;
          contextReferences.push(headersReference);
        }

        addResolvedReferenceImports(sourceFile, contextReferences, () => {
          return `../../context-configs/${parsed.contextConfigId}`;
        });
      }

      const canUseToolReferences = resolveReferenceBindingsFromIds({
        ids: collectCanUseToolIds(parsed.normalizedCanUse),
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'Tool',
        collisionStrategy: 'numeric',
        referenceOverrides: parsed.referenceOverrides?.tools,
        referencePathOverrides: parsed.referencePathOverrides?.tools,
        defaultModulePath: toCamelCase,
      });
      addResolvedReferenceImports(sourceFile, canUseToolReferences, (reference) => {
        return `../../tools/${reference.modulePath}`;
      });

      const dataComponentReferences = resolveReferenceBindingsFromIds({
        ids: parsed.dataComponents ?? [],
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'DataComponent',
        referenceOverrides: parsed.referenceOverrides?.dataComponents,
        defaultModulePath: (id) => id,
      });
      addResolvedReferenceImports(sourceFile, dataComponentReferences, (reference) => {
        return `../../data-components/${reference.modulePath}`;
      });

      const artifactComponentReferences = resolveReferenceBindingsFromIds({
        ids: parsed.artifactComponents ?? [],
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'ArtifactComponent',
        referenceOverrides: parsed.referenceOverrides?.artifactComponents,
        defaultModulePath: (id) => id,
      });
      addResolvedReferenceImports(sourceFile, artifactComponentReferences, (reference) => {
        return `../../artifact-components/${reference.modulePath}`;
      });

      const delegateTargetIds = collectDelegateTargetIds(
        parsed.normalizedCanDelegateTo,
        parsed.canTransferTo,
        parsed.id,
        {
          subAgents: parsed.referenceOverrides?.subAgents,
          agents: parsed.referenceOverrides?.agents,
          externalAgents: parsed.referenceOverrides?.externalAgents,
        }
      );
      const subAgentDelegateReferences = resolveReferenceBindingsFromIds({
        ids: delegateTargetIds.subAgents,
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'SubAgent',
        referenceOverrides: parsed.referenceOverrides?.subAgents,
        referencePathOverrides: parsed.referencePathOverrides?.subAgents,
        defaultModulePath: (id) => id,
      });
      addResolvedReferenceImports(sourceFile, subAgentDelegateReferences, (reference) => {
        return `./${reference.modulePath}`;
      });
      const agentDelegateReferences = resolveReferenceBindingsFromIds({
        ids: delegateTargetIds.agents,
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'Agent',
        referenceOverrides: parsed.referenceOverrides?.agents,
        referencePathOverrides: parsed.referencePathOverrides?.agents,
        defaultModulePath: (id) => id,
      });
      addResolvedReferenceImports(sourceFile, agentDelegateReferences, (reference) => {
        return `../${reference.modulePath}`;
      });
      const externalAgentDelegateReferences = resolveReferenceBindingsFromIds({
        ids: delegateTargetIds.externalAgents,
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'ExternalAgent',
        referenceOverrides: parsed.referenceOverrides?.externalAgents,
        referencePathOverrides: parsed.referencePathOverrides?.externalAgents,
        defaultModulePath: (id) => id,
      });
      addResolvedReferenceImports(sourceFile, externalAgentDelegateReferences, (reference) => {
        return `../../external-agents/${reference.modulePath}`;
      });

      writeSubAgentConfig(
        configObject,
        {
          contextReference: contextReferenceName,
          headersReference: headersReferenceName,
        },
        {
          tools: toReferenceNameRecord(canUseToolReferences),
          subAgents: toReferenceNameRecord(subAgentDelegateReferences),
          agents: toReferenceNameRecord(agentDelegateReferences),
          externalAgents: toReferenceNameRecord(externalAgentDelegateReferences),
          dataComponents: toReferenceNameRecord(dataComponentReferences),
          artifactComponents: toReferenceNameRecord(artifactComponentReferences),
        },
        parsed
      );
    },
  });
}

type DelegateTargetType = 'subAgents' | 'agents' | 'externalAgents';

function collectCanUseToolIds(canUse?: NormalizedCanUseEntry[]): string[] {
  if (!canUse?.length) {
    return [];
  }

  return [...new Set(canUse.map((item) => item.toolId))];
}

function collectDelegateTargetIds(
  canDelegateTo: NormalizedCanDelegateToEntry[] | undefined,
  canTransferTo: string[] | undefined,
  currentSubAgentId: string,
  referenceOverrides: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  }
): Record<DelegateTargetType, string[]> {
  const idsByType: Record<DelegateTargetType, Set<string>> = {
    subAgents: new Set<string>(),
    agents: new Set<string>(),
    externalAgents: new Set<string>(),
  };

  for (const item of canDelegateTo ?? []) {
    const type = item.type ?? resolveDelegateTargetType(item.id, referenceOverrides);
    if (!(type === 'subAgents' && item.id === currentSubAgentId)) {
      idsByType[type].add(item.id);
    }
  }

  for (const targetId of canTransferTo ?? []) {
    const type = resolveDelegateTargetType(targetId, referenceOverrides);
    if (type === 'subAgents' && targetId === currentSubAgentId) {
      continue;
    }
    idsByType[type].add(targetId);
  }

  return {
    subAgents: [...idsByType.subAgents],
    agents: [...idsByType.agents],
    externalAgents: [...idsByType.externalAgents],
  };
}

function resolveDelegateTargetType(
  targetId: string,
  referenceOverrides: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  }
): DelegateTargetType {
  if (referenceOverrides.subAgents?.[targetId]) {
    return 'subAgents';
  }
  if (referenceOverrides.agents?.[targetId]) {
    return 'agents';
  }
  if (referenceOverrides.externalAgents?.[targetId]) {
    return 'externalAgents';
  }

  return 'subAgents';
}

function writeSubAgentConfig(
  configObject: ObjectLiteralExpression,
  templateReferences: {
    contextReference?: string;
    headersReference?: string;
  },
  referenceNames: {
    tools?: Record<string, string>;
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
    dataComponents?: Record<string, string>;
    artifactComponents?: Record<string, string>;
  },
  {
    dataComponents,
    name,
    canDelegateTo: _canDelegateTo,
    canTransferTo,
    skills: _skills,
    artifactComponents,
    canUse: _canUse,
    normalizedCanDelegateTo,
    normalizedCanUse,
    normalizedSkills,
    referenceOverrides: _referenceOverrides,
    referencePathOverrides: _referencePathOverrides,
    contextConfigId: _contextConfigId,
    contextConfigReference: _contextConfigReference,
    contextConfigHeadersReference: _contextConfigHeadersReference,
    ...rest
  }: SubAgentOutput
) {
  rest = { ...rest };
  rest.prompt &&= formatTemplate(rest.prompt, templateReferences);
  const subAgentConfig: Record<string, unknown> = {
    ...rest,
    name: resolveSubAgentName(rest.id, name),
  };

  const canUseReferences = collectCanUseReferences(
    normalizedCanUse,
    Object.keys(referenceNames.tools ?? {}).length ? referenceNames.tools : undefined
  );
  if (canUseReferences.length) {
    subAgentConfig.canUse = createReferenceGetterValue(canUseReferences);
  }

  const canDelegateToReferences = collectCanDelegateToReferences(normalizedCanDelegateTo, {
    subAgents: referenceNames.subAgents,
    agents: referenceNames.agents,
    externalAgents: referenceNames.externalAgents,
  });
  if (canDelegateToReferences.length) {
    subAgentConfig.canDelegateTo = createReferenceGetterValue(canDelegateToReferences);
  }

  if (hasReferences(canTransferTo)) {
    subAgentConfig.canTransferTo = createReferenceGetterValue(
      canTransferTo.map((id) =>
        codeReference(
          resolveReferenceName(id, [
            referenceNames.subAgents,
            referenceNames.agents,
            referenceNames.externalAgents,
          ])
        )
      )
    );
  }

  if (hasReferences(dataComponents)) {
    subAgentConfig.dataComponents = createReferenceGetterValue(
      dataComponents.map((id) =>
        codeReference(resolveReferenceName(id, [referenceNames.dataComponents]))
      )
    );
  }

  if (hasReferences(artifactComponents)) {
    subAgentConfig.artifactComponents = createReferenceGetterValue(
      artifactComponents.map((id) =>
        codeReference(resolveReferenceName(id, [referenceNames.artifactComponents]))
      )
    );
  }

  const collectedSkills = collectSkills(normalizedSkills);
  if (collectedSkills.length > 0) {
    subAgentConfig.skills = createArrayGetterValue(collectedSkills);
  }

  for (const [key, value] of Object.entries(subAgentConfig)) {
    addValueToObject(configObject, key, value);
  }
}

export const task = {
  type: 'sub-agent',
  collect(context) {
    if (!context.project.agents) {
      return [];
    }

    const recordsBySubAgentId = new Map<
      string,
      ReturnType<
        GenerationTask<Parameters<typeof generateSubAgentDefinition>[0]>['collect']
      >[number]
    >();

    for (const agentId of context.completeAgentIds) {
      const agentData = context.project.agents[agentId];
      const subAgents = asRecord(agentData?.subAgents);
      if (!subAgents) {
        continue;
      }

      for (const [subAgentId, subAgentData] of Object.entries(subAgents)) {
        const payload = asRecord(subAgentData);
        if (!payload) {
          continue;
        }

        const dependencyReferences = collectSubAgentDependencyReferenceOverrides(context, payload);
        const subAgentName = typeof payload.name === 'string' ? payload.name : undefined;
        const subAgentFilePath = context.resolver.resolveOutputFilePath(
          'subAgents',
          subAgentId,
          join(
            context.paths.agentsDir,
            'sub-agents',
            buildComponentFileName(subAgentId, subAgentName)
          )
        );
        const contextTemplateReferences = collectContextTemplateReferences(
          context,
          agentData,
          subAgentFilePath,
          [typeof payload.prompt === 'string' ? payload.prompt : undefined]
        );

        recordsBySubAgentId.set(subAgentId, {
          id: subAgentId,
          filePath: subAgentFilePath,
          payload: {
            subAgentId,
            ...payload,
            ...(dependencyReferences?.referenceOverrides && {
              referenceOverrides: dependencyReferences.referenceOverrides,
            }),
            ...(dependencyReferences?.referencePathOverrides && {
              referencePathOverrides: dependencyReferences.referencePathOverrides,
            }),
            ...(contextTemplateReferences && {
              contextConfigId: contextTemplateReferences.contextConfigId,
              contextConfigReference: contextTemplateReferences.contextConfigReference,
            }),
            ...(contextTemplateReferences?.contextConfigHeadersReference && {
              contextConfigHeadersReference:
                contextTemplateReferences.contextConfigHeadersReference,
            }),
          } as unknown as Parameters<typeof generateSubAgentDefinition>[0],
        });
      }
    }

    return [...recordsBySubAgentId.values()];
  },
  generate: generateSubAgentDefinition,
} satisfies GenerationTask<Parameters<typeof generateSubAgentDefinition>[0]>;
