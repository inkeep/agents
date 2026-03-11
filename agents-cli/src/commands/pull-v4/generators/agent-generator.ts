import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import { asRecord } from '../collector-common';
import {
  collectContextTemplateReferences,
  collectSubAgentReferenceOverrides,
  collectSubAgentReferencePathOverrides,
} from '../collector-reference-helpers';
import type { GenerationTask } from '../generation-types';
import {
  addResolvedReferenceImports,
  resolveReferenceBinding,
  resolveReferenceBindingsFromIds,
  toReferenceNameMap,
} from '../reference-resolution';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addValueToObject,
  buildComponentFileName,
  codePropertyAccess,
  codeReference,
  createReferenceGetterValue,
  formatTemplate,
  isPlainObject,
  toCamelCase,
  toTriggerReferenceName,
} from '../utils';
import {
  addScheduledTriggerImports,
  addStatusComponentImports,
  addTriggerImports,
  collectTemplateVariableNamesFromFields,
  createReferenceNameMap,
  createScheduledTriggerReferenceMaps,
  createTriggerReferenceMaps,
  extractIds,
  type ReferenceNameMap,
} from './helpers/agent';

const SubAgentReferenceSchema = z.object({
  name: z.string().nonempty(),
  local: z.boolean().optional(),
});

const MySchema = FullProjectDefinitionSchema.shape.agents.valueType.omit({
  id: true,
});

const SubAgentSchema = MySchema.shape.subAgents.valueType.omit({
  // Invalid input: expected "internal"
  type: true,
});

const ToolSchema = MySchema.shape.tools.unwrap().valueType;

const BaseAgentSchema = z.strictObject({
  agentId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  models: z.preprocess((v) => v ?? undefined, MySchema.shape.models),
  stopWhen: z.preprocess(
    (v) => (v && Object.keys(v).length && v) || undefined,
    MySchema.shape.stopWhen
  ),
  subAgents: z.record(
    z.string(),
    z.strictObject({
      ...SubAgentSchema.shape,
      models: z.preprocess((v) => v ?? undefined, SubAgentSchema.shape.models),
      stopWhen: z.preprocess((v) => v ?? undefined, SubAgentSchema.shape.stopWhen),
      // Unrecognized keys: "name", "description", "content", "metadata", "subAgentSkillId", "subAgentId", "createdAt", "updatedAt"
      skills: z.unknown(),
      // Invalid input
      canDelegateTo: z.unknown(),
    })
  ),
  tools: z
    .record(
      z.string(),
      z.strictObject({
        ...ToolSchema.shape,
        // Invalid input: expected string, received null
        imageUrl: z.preprocess((v) => v ?? undefined, ToolSchema.shape.imageUrl),
      })
    )
    .optional(),
  // ✖ Invalid input: expected string, received undefined
  // → at triggers.t546ck7yueh52jils88rm.authentication.headers[0].value
  triggers: z.record(z.string(), z.unknown()).optional(),
  agentVariableName: z.string().nonempty().optional(),
  subAgentReferences: z.record(z.string(), SubAgentReferenceSchema).optional(),
  subAgentReferencePathOverrides: z.record(z.string(), z.string().nonempty()).optional(),
  contextConfigReference: SubAgentReferenceSchema.optional(),
  contextConfigHeadersReference: SubAgentReferenceSchema.optional(),
});

const AgentSchema = BaseAgentSchema.transform((data) => ({
  ...data,
  normalizedContextConfigId: normalizeContextConfigId(data.contextConfig),
  normalizedStatusComponentIds: normalizeStatusComponentIds(data.statusUpdates?.statusComponents),
  normalizedStatusComponentSequence: normalizeStatusComponentSequence(
    data.statusUpdates?.statusComponents
  ),
}));

type AgentInput = z.input<typeof AgentSchema>;
type AgentOutput = z.output<typeof AgentSchema>;

function normalizeContextConfigId(contextConfig: unknown): string | undefined {
  if (typeof contextConfig === 'string') {
    return contextConfig;
  }

  if (isPlainObject(contextConfig) && typeof contextConfig.id === 'string') {
    return contextConfig.id;
  }

  return undefined;
}

function normalizeStatusComponentId(statusComponent: unknown): string | undefined {
  if (typeof statusComponent === 'string') {
    return statusComponent;
  }

  if (!isPlainObject(statusComponent)) {
    return undefined;
  }

  if (typeof statusComponent.id === 'string') {
    return statusComponent.id;
  }

  if (typeof statusComponent.type === 'string') {
    return statusComponent.type;
  }

  return undefined;
}

function normalizeStatusComponentSequence(statusComponents: unknown[] | undefined): string[] {
  if (!Array.isArray(statusComponents)) {
    return [];
  }

  return statusComponents
    .map((statusComponent) => normalizeStatusComponentId(statusComponent))
    .filter((statusComponentId): statusComponentId is string => Boolean(statusComponentId));
}

function normalizeStatusComponentIds(statusComponents: unknown[] | undefined): string[] {
  return [...new Set(normalizeStatusComponentSequence(statusComponents))];
}

interface AgentReferenceNames {
  subAgents: ReferenceNameMap;
  contextConfig?: string;
  contextHeaders?: string;
  triggers: ReferenceNameMap;
  scheduledTriggers: ReferenceNameMap;
  statusComponents: ReferenceNameMap;
}

export function generateAgentDefinition({
  id,
  createdAt,
  updatedAt,
  ...data
}: AgentInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: AgentSchema,
    factory: {
      importName: 'agent',
      variableName: (parsed) => parsed.agentVariableName || toCamelCase(parsed.agentId),
    },
    render({ parsed, sourceFile, configObject }) {
      const subAgentIds = new Set(extractIds(parsed.subAgents));
      if (parsed.defaultSubAgentId) {
        subAgentIds.add(parsed.defaultSubAgentId);
      }
      const agentVarName = parsed.agentVariableName || toCamelCase(parsed.agentId);
      const reservedReferenceNames = new Set([agentVarName]);
      const subAgentReferences = resolveReferenceBindingsFromIds({
        ids: subAgentIds,
        reservedNames: reservedReferenceNames,
        conflictSuffix: 'SubAgent',
        referenceOverrides: parsed.subAgentReferences,
        referencePathOverrides: parsed.subAgentReferencePathOverrides,
        defaultModulePath: (id) => id,
      });
      const subAgentReferenceNames = toReferenceNameMap(subAgentReferences);
      addResolvedReferenceImports(sourceFile, subAgentReferences, (reference) => {
        return `./sub-agents/${reference.modulePath}`;
      });

      const contextConfigId = parsed.normalizedContextConfigId;
      let contextConfigReferenceName: string | undefined;
      let contextHeadersReferenceName: string | undefined;
      const promptTemplateVariables = collectTemplateVariableNamesFromFields([
        parsed.prompt,
        parsed.statusUpdates?.prompt,
      ]);
      const hasHeadersTemplateVariables = promptTemplateVariables.some((variableName) =>
        variableName.startsWith('headers.')
      );
      if (contextConfigId) {
        const contextConfigReference = resolveReferenceBinding(
          {
            id: `${contextConfigId}:context`,
            importName: parsed.contextConfigReference?.name ?? toCamelCase(contextConfigId),
            modulePath: contextConfigId,
            local: parsed.contextConfigReference?.local === true,
            conflictSuffix: 'ContextConfig',
          },
          {
            reservedNames: reservedReferenceNames,
          }
        );
        contextConfigReferenceName = contextConfigReference.localName;

        const contextReferences = [contextConfigReference];
        if (hasHeadersTemplateVariables) {
          const headersReference = resolveReferenceBinding(
            {
              id: `${contextConfigId}:headers`,
              importName:
                parsed.contextConfigHeadersReference?.name ??
                `${toCamelCase(contextConfigId)}Headers`,
              modulePath: contextConfigId,
              local: parsed.contextConfigHeadersReference?.local === true,
              conflictSuffix: 'Headers',
            },
            {
              reservedNames: reservedReferenceNames,
            }
          );
          contextHeadersReferenceName = headersReference.localName;
          contextReferences.push(headersReference);
        }

        addResolvedReferenceImports(sourceFile, contextReferences, () => {
          return `../context-configs/${contextConfigId}`;
        });
      }

      const { referenceNames: triggerReferenceNames, importRefs: triggerImportRefs } =
        createTriggerReferenceMaps(parsed.triggers, reservedReferenceNames);
      addTriggerImports(sourceFile, triggerReferenceNames, triggerImportRefs);

      const {
        referenceNames: scheduledTriggerReferenceNames,
        importRefs: scheduledTriggerImportRefs,
      } = createScheduledTriggerReferenceMaps(parsed.scheduledTriggers, reservedReferenceNames);
      addScheduledTriggerImports(
        sourceFile,
        scheduledTriggerReferenceNames,
        scheduledTriggerImportRefs
      );

      const statusComponentReferenceNames = createReferenceNameMap(
        parsed.normalizedStatusComponentIds,
        reservedReferenceNames,
        'StatusComponent'
      );
      addStatusComponentImports(sourceFile, statusComponentReferenceNames);

      writeAgentConfig(configObject, parsed, {
        subAgents: subAgentReferenceNames,
        contextConfig: contextConfigReferenceName,
        contextHeaders: contextHeadersReferenceName,
        triggers: triggerReferenceNames,
        scheduledTriggers: scheduledTriggerReferenceNames,
        statusComponents: statusComponentReferenceNames,
      });
    },
  });
}

function writeAgentConfig(
  configObject: ObjectLiteralExpression,
  data: AgentOutput,
  referenceNames: AgentReferenceNames
) {
  const agentConfig: Record<string, unknown> = {
    id: data.agentId,
    name: data.name,
    description: data.description,
    prompt:
      data.prompt &&
      formatTemplate(data.prompt, {
        contextReference: referenceNames.contextConfig,
        headersReference: referenceNames.contextHeaders,
      }),
    models: data.models,
    stopWhen: data.stopWhen,
  };

  const { defaultSubAgentId } = data;
  if (defaultSubAgentId) {
    agentConfig.defaultSubAgent = codeReference(
      referenceNames.subAgents.get(defaultSubAgentId) ?? toCamelCase(defaultSubAgentId)
    );
  }

  const subAgentIds = extractIds(data.subAgents);
  agentConfig.subAgents = createReferenceGetterValue(
    subAgentIds.map((id) => referenceNames.subAgents.get(id) ?? toCamelCase(id))
  );

  const contextConfigId = data.normalizedContextConfigId;
  if (contextConfigId && referenceNames.contextConfig) {
    agentConfig.contextConfig = codeReference(referenceNames.contextConfig);
  }

  const triggerIds = data.triggers ? extractIds(data.triggers) : [];
  if (triggerIds.length) {
    agentConfig.triggers = createReferenceGetterValue(
      triggerIds.map((id) => referenceNames.triggers.get(id) ?? toTriggerReferenceName(id))
    );
  }

  const scheduledTriggerIds = data.scheduledTriggers ? extractIds(data.scheduledTriggers) : [];
  if (scheduledTriggerIds.length) {
    agentConfig.scheduledTriggers = createReferenceGetterValue(
      scheduledTriggerIds.map(
        (id) => referenceNames.scheduledTriggers.get(id) ?? toTriggerReferenceName(id)
      )
    );
  }

  if (data.statusUpdates) {
    const statusComponentRefs = data.normalizedStatusComponentSequence.map((statusComponentId) =>
      codePropertyAccess(
        referenceNames.statusComponents.get(statusComponentId) ?? toCamelCase(statusComponentId),
        'config'
      )
    );
    agentConfig.statusUpdates = {
      numEvents: data.statusUpdates.numEvents,
      timeInSeconds: data.statusUpdates.timeInSeconds,
      prompt:
        data.statusUpdates.prompt &&
        formatTemplate(data.statusUpdates.prompt, {
          contextReference: referenceNames.contextConfig,
          headersReference: referenceNames.contextHeaders,
        }),
      ...(statusComponentRefs?.length && { statusComponents: statusComponentRefs }),
    };
  }

  for (const [key, value] of Object.entries(agentConfig)) {
    addValueToObject(configObject, key, value);
  }
}

export const task = {
  type: 'agent',
  collect(context) {
    if (!context.project.agents) {
      return [];
    }

    const records = [];
    for (const agentId of context.completeAgentIds) {
      const agentData = context.project.agents[agentId];
      if (!agentData) {
        continue;
      }

      const agentName = typeof agentData.name === 'string' ? agentData.name : undefined;
      const agentFilePath = context.resolver.resolveOutputFilePath(
        'agents',
        agentId,
        join(context.paths.agentsDir, buildComponentFileName(agentId, agentName))
      );
      const existingAgent = context.resolver.getExistingComponent(agentId, 'agents');
      const subAgentReferences = collectSubAgentReferenceOverrides(
        context,
        agentData,
        agentFilePath
      );
      const subAgentReferencePathOverrides = collectSubAgentReferencePathOverrides(
        context,
        agentData
      );
      const statusUpdates = asRecord(agentData.statusUpdates);
      const contextTemplateReferences = collectContextTemplateReferences(
        context,
        agentData,
        agentFilePath,
        [
          typeof agentData.prompt === 'string' ? agentData.prompt : undefined,
          typeof statusUpdates?.prompt === 'string' ? statusUpdates.prompt : undefined,
        ]
      );

      records.push({
        id: agentId,
        filePath: agentFilePath,
        payload: {
          agentId,
          ...agentData,
          ...(existingAgent?.name?.length && { agentVariableName: existingAgent.name }),
          ...(Object.keys(subAgentReferences).length && { subAgentReferences }),
          ...(Object.keys(subAgentReferencePathOverrides).length && {
            subAgentReferencePathOverrides,
          }),
          ...(contextTemplateReferences && {
            contextConfigReference: contextTemplateReferences.contextConfigReference,
          }),
          ...(contextTemplateReferences?.contextConfigHeadersReference && {
            contextConfigHeadersReference: contextTemplateReferences.contextConfigHeadersReference,
          }),
        } as Parameters<typeof generateAgentDefinition>[0],
      });
    }

    return records;
  },
  generate: generateAgentDefinition,
} satisfies GenerationTask<Parameters<typeof generateAgentDefinition>[0]>;
