import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addValueToObject,
  createFactoryDefinition,
  formatTemplate,
  resolveContextTemplateImports,
  toCamelCase,
  toTriggerReferenceName,
} from '../utils';
import {
  addScheduledTriggerImports,
  addStatusComponentImports,
  addSubAgentImports,
  addTriggerImports,
  collectTemplateVariableNamesFromFields,
  createReferenceNameMap,
  createScheduledTriggerReferenceMaps,
  createSubAgentReferenceMaps,
  createTriggerReferenceMaps,
  extractContextConfigId,
  extractIds,
  extractStatusComponentIds,
  type ReferenceNameMap,
  resolveStatusComponentId,
} from './agent-generator.helpers';

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

const AgentSchema = z.strictObject({
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

type AgentInput = z.input<typeof AgentSchema>;
type AgentOutput = z.output<typeof AgentSchema>;

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
  const result = AgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for agent:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;

  const subAgentIds = new Set(extractIds(parsed.subAgents));
  if (parsed.defaultSubAgentId) {
    subAgentIds.add(parsed.defaultSubAgentId);
  }
  const agentVarName = parsed.agentVariableName || toCamelCase(parsed.agentId);
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'agent',
    variableName: agentVarName,
  });
  const reservedReferenceNames = new Set([agentVarName]);
  const { referenceNames: subAgentReferenceNames, importNames: subAgentImportNames } =
    createSubAgentReferenceMaps(
      subAgentIds,
      reservedReferenceNames,
      'SubAgent',
      parsed.subAgentReferences
    );
  addSubAgentImports(
    sourceFile,
    subAgentReferenceNames,
    subAgentImportNames,
    parsed.subAgentReferencePathOverrides
  );

  const contextConfigId = extractContextConfigId(parsed.contextConfig);
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
    const contextImportResolution = resolveContextTemplateImports({
      reservedNames: reservedReferenceNames,
      shouldResolveContextReference: true,
      shouldResolveHeadersReference: hasHeadersTemplateVariables,
      contextConfigReference: parsed.contextConfigReference,
      contextConfigHeadersReference: parsed.contextConfigHeadersReference,
      defaultContextImportName: toCamelCase(contextConfigId),
      defaultHeadersImportName: `${toCamelCase(contextConfigId)}Headers`,
    });
    contextConfigReferenceName = contextImportResolution.contextReferenceName;
    contextHeadersReferenceName = contextImportResolution.headersReferenceName;

    if (contextImportResolution.namedImports.length > 0) {
      sourceFile.addImportDeclaration({
        namedImports: contextImportResolution.namedImports,
        moduleSpecifier: `../context-configs/${contextConfigId}`,
      });
    }
  }

  const { referenceNames: triggerReferenceNames, importRefs: triggerImportRefs } =
    createTriggerReferenceMaps(parsed.triggers, reservedReferenceNames);
  addTriggerImports(sourceFile, triggerReferenceNames, triggerImportRefs);

  const { referenceNames: scheduledTriggerReferenceNames, importRefs: scheduledTriggerImportRefs } =
    createScheduledTriggerReferenceMaps(parsed.scheduledTriggers, reservedReferenceNames);
  addScheduledTriggerImports(
    sourceFile,
    scheduledTriggerReferenceNames,
    scheduledTriggerImportRefs
  );

  const statusComponentReferenceNames = createReferenceNameMap(
    extractStatusComponentIds(parsed.statusUpdates),
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
  return sourceFile;
}

function writeAgentConfig(
  configObject: ObjectLiteralExpression,
  data: AgentOutput,
  referenceNames: AgentReferenceNames
) {
  for (const [key, value] of Object.entries({
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
  })) {
    addValueToObject(configObject, key, value);
  }

  const { defaultSubAgentId } = data;
  if (defaultSubAgentId) {
    configObject.addPropertyAssignment({
      name: 'defaultSubAgent',
      initializer:
        referenceNames.subAgents.get(defaultSubAgentId) ?? toCamelCase(defaultSubAgentId),
    });
  }

  const subAgentIds = extractIds(data.subAgents);
  addReferenceGetterProperty(
    configObject,
    'subAgents',
    subAgentIds.map((id) => referenceNames.subAgents.get(id) ?? toCamelCase(id))
  );

  const contextConfigId = extractContextConfigId(data.contextConfig);
  if (contextConfigId && referenceNames.contextConfig) {
    configObject.addPropertyAssignment({
      name: 'contextConfig',
      initializer: referenceNames.contextConfig,
    });
  }

  const triggerIds = data.triggers ? extractIds(data.triggers) : [];
  if (triggerIds.length) {
    addReferenceGetterProperty(
      configObject,
      'triggers',
      triggerIds.map((id) => referenceNames.triggers.get(id) ?? toTriggerReferenceName(id))
    );
  }

  const scheduledTriggerIds = data.scheduledTriggers ? extractIds(data.scheduledTriggers) : [];
  if (scheduledTriggerIds.length) {
    addReferenceGetterProperty(
      configObject,
      'scheduledTriggers',
      scheduledTriggerIds.map(
        (id) => referenceNames.scheduledTriggers.get(id) ?? toTriggerReferenceName(id)
      )
    );
  }

  if (data.statusUpdates) {
    const statusUpdatesProperty = configObject.addPropertyAssignment({
      name: 'statusUpdates',
      initializer: '{}',
    });
    const statusUpdatesObject = statusUpdatesProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    addValueToObject(statusUpdatesObject, 'numEvents', data.statusUpdates.numEvents);
    addValueToObject(statusUpdatesObject, 'timeInSeconds', data.statusUpdates.timeInSeconds);
    addValueToObject(
      statusUpdatesObject,
      'prompt',
      data.statusUpdates.prompt &&
        formatTemplate(data.statusUpdates.prompt, {
          contextReference: referenceNames.contextConfig,
          headersReference: referenceNames.contextHeaders,
        })
    );
    const statusComponentRefs = data.statusUpdates.statusComponents?.map(
      (statusComponent) =>
        `${referenceNames.statusComponents.get(resolveStatusComponentId(statusComponent)) ?? toCamelCase(resolveStatusComponentId(statusComponent))}.config`
    );
    if (statusComponentRefs?.length) {
      const statusComponentsProperty = statusUpdatesObject.addPropertyAssignment({
        name: 'statusComponents',
        initializer: '[]',
      });
      const statusComponentsArray = statusComponentsProperty.getInitializerIfKindOrThrow(
        SyntaxKind.ArrayLiteralExpression
      );
      statusComponentsArray.addElements(statusComponentRefs);
    }
  }
}
