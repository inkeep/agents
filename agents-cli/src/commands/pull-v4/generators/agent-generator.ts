import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addReferenceGetterProperty,
  addStringProperty,
  collectTemplateVariableNames as collectTemplateVariableNamesFromString,
  convertNullToUndefined,
  createFactoryDefinition,
  createUniqueReferenceName,
  formatStringLiteral,
  formatTemplate,
  isPlainObject,
  toCamelCase,
} from '../utils';

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
  models: z.preprocess(convertNullToUndefined, MySchema.shape.models),
  stopWhen: z.preprocess(convertNullToUndefined, MySchema.shape.stopWhen),
  subAgents: z.record(
    z.string(),
    z.strictObject({
      ...SubAgentSchema.shape,
      models: z.preprocess(convertNullToUndefined, SubAgentSchema.shape.models),
      stopWhen: z.preprocess(convertNullToUndefined, SubAgentSchema.shape.stopWhen),
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
  contextConfigReference: SubAgentReferenceSchema.optional(),
  contextConfigHeadersReference: SubAgentReferenceSchema.optional(),
});

type AgentInput = z.input<typeof AgentSchema>;
type AgentOutput = z.output<typeof AgentSchema>;
type ReferenceNameMap = Map<string, string>;

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
}: AgentInput): SourceFile {
  const result = AgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for agent:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;

  const subAgentIds = new Set(extractIds(parsed.subAgents));
  subAgentIds.add(parsed.defaultSubAgentId);
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
  addSubAgentImports(sourceFile, subAgentReferenceNames, subAgentImportNames);

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
    const contextConfigImportName =
      parsed.contextConfigReference?.name ?? toCamelCase(contextConfigId);
    contextConfigReferenceName = createUniqueReferenceName(
      contextConfigImportName,
      reservedReferenceNames,
      'ContextConfig'
    );
    const contextHeadersImportName =
      parsed.contextConfigHeadersReference?.name ?? `${toCamelCase(contextConfigId)}Headers`;
    if (hasHeadersTemplateVariables) {
      contextHeadersReferenceName = createUniqueReferenceName(
        contextHeadersImportName,
        reservedReferenceNames,
        'Headers'
      );
    }

    const namedImports: Array<string | { name: string; alias: string }> = [];
    if (parsed.contextConfigReference?.local !== true) {
      namedImports.push(
        contextConfigImportName === contextConfigReferenceName
          ? contextConfigImportName
          : { name: contextConfigImportName, alias: contextConfigReferenceName }
      );
    }
    if (
      hasHeadersTemplateVariables &&
      contextHeadersReferenceName &&
      parsed.contextConfigHeadersReference?.local !== true
    ) {
      namedImports.push(
        contextHeadersImportName === contextHeadersReferenceName
          ? contextHeadersImportName
          : { name: contextHeadersImportName, alias: contextHeadersReferenceName }
      );
    }

    if (namedImports.length > 0) {
      sourceFile.addImportDeclaration({
        namedImports,
        moduleSpecifier: `../context-configs/${contextConfigId}`,
      });
    }
  }

  const triggerIds = parsed.triggers ? extractIds(parsed.triggers) : [];
  const triggerReferenceNames = createReferenceNameMap(
    triggerIds,
    reservedReferenceNames,
    'Trigger'
  );
  addTriggerImports(sourceFile, triggerReferenceNames);

  const scheduledTriggerIds = parsed.scheduledTriggers ? extractIds(parsed.scheduledTriggers) : [];
  const scheduledTriggerReferenceNames = createReferenceNameMap(
    scheduledTriggerIds,
    reservedReferenceNames,
    'ScheduledTrigger'
  );
  addScheduledTriggerImports(sourceFile, scheduledTriggerReferenceNames);

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
  addStringProperty(configObject, 'id', data.agentId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description != null) {
    addStringProperty(configObject, 'description', data.description);
  }

  if (data.prompt !== undefined) {
    const template = formatTemplate(data.prompt, {
      contextReference: referenceNames.contextConfig,
      headersReference: referenceNames.contextHeaders,
    });
    configObject.addPropertyAssignment({
      name: 'prompt',
      initializer: formatStringLiteral(template),
    });
  }

  if (data.models && Object.keys(data.models).length > 0) {
    const modelsProperty = configObject.addPropertyAssignment({
      name: 'models',
      initializer: '{}',
    });
    const modelsObject = modelsProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    addObjectEntries(modelsObject, data.models);
  }

  configObject.addPropertyAssignment({
    name: 'defaultSubAgent',
    initializer:
      referenceNames.subAgents.get(data.defaultSubAgentId) ?? toCamelCase(data.defaultSubAgentId),
  });

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

  if (data.credentials?.length) {
    const credentialIds = data.credentials
      .map((credential) => {
        if (typeof credential === 'string') {
          return credential;
        }
        return credential.id;
      })
      .filter((id): id is string => Boolean(id));

    if (credentialIds.length > 0) {
      addReferenceGetterProperty(
        configObject,
        'credentials',
        credentialIds.map((id) => toCamelCase(id))
      );
    }
  }

  const triggerIds = data.triggers ? extractIds(data.triggers) : [];
  if (triggerIds.length > 0) {
    addReferenceGetterProperty(
      configObject,
      'triggers',
      triggerIds.map((id) => referenceNames.triggers.get(id) ?? toCamelCase(id))
    );
  }

  const scheduledTriggerIds = data.scheduledTriggers ? extractIds(data.scheduledTriggers) : [];
  if (scheduledTriggerIds.length > 0) {
    addReferenceGetterProperty(
      configObject,
      'scheduledTriggers',
      scheduledTriggerIds.map((id) => referenceNames.scheduledTriggers.get(id) ?? toCamelCase(id))
    );
  }

  if (data.stopWhen?.transferCountIs !== undefined) {
    const stopWhenProperty = configObject.addPropertyAssignment({
      name: 'stopWhen',
      initializer: '{}',
    });
    const stopWhenObject = stopWhenProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    stopWhenObject.addPropertyAssignment({
      name: 'transferCountIs',
      initializer: String(data.stopWhen.transferCountIs),
    });
  }

  if (data.statusUpdates) {
    const statusUpdatesProperty = configObject.addPropertyAssignment({
      name: 'statusUpdates',
      initializer: '{}',
    });
    const statusUpdatesObject = statusUpdatesProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );

    if (data.statusUpdates.numEvents !== undefined) {
      statusUpdatesObject.addPropertyAssignment({
        name: 'numEvents',
        initializer: String(data.statusUpdates.numEvents),
      });
    }

    if (data.statusUpdates.timeInSeconds !== undefined) {
      statusUpdatesObject.addPropertyAssignment({
        name: 'timeInSeconds',
        initializer: String(data.statusUpdates.timeInSeconds),
      });
    }

    if (data.statusUpdates.statusComponents && data.statusUpdates.statusComponents.length > 0) {
      const statusComponentRefs = data.statusUpdates.statusComponents.map(
        (statusComponent) =>
          `${referenceNames.statusComponents.get(resolveStatusComponentId(statusComponent)) ?? toCamelCase(resolveStatusComponentId(statusComponent))}.config`
      );

      if (statusComponentRefs.length > 0) {
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

    if (data.statusUpdates.prompt !== undefined) {
      const template = formatTemplate(data.statusUpdates.prompt, {
        contextReference: referenceNames.contextConfig,
        headersReference: referenceNames.contextHeaders,
      });
      statusUpdatesObject.addPropertyAssignment({
        name: 'prompt',
        initializer: formatStringLiteral(template),
      });
    }
  }
}

function collectTemplateVariableNamesFromFields(values: Array<string | undefined>): string[] {
  const variables: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    variables.push(...collectTemplateVariableNamesFromString(value));
  }
  return variables;
}

function extractIds(value: string[] | Record<string, unknown>): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        // @ts-expect-error -- fixme
        if (isPlainObject(item) && typeof item.id === 'string') {
          // @ts-expect-error -- fixme
          return item.id;
        }
        return null;
      })
      .filter((id) => !!id);
  }
  return Object.keys(value);
}

function extractContextConfigId(contextConfig?: string | { id?: string }): string | undefined {
  if (!contextConfig) {
    return;
  }
  if (typeof contextConfig === 'string') {
    return contextConfig;
  }
  return contextConfig.id;
}

function addSubAgentImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap,
  importNames: ReferenceNameMap
): void {
  for (const [subAgentId, referenceName] of referenceNames) {
    const importName = importNames.get(subAgentId);
    if (!importName) {
      continue;
    }

    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `./sub-agents/${subAgentId}`,
    });
  }
}

function addTriggerImports(sourceFile: SourceFile, referenceNames: ReferenceNameMap): void {
  for (const [triggerId, referenceName] of referenceNames) {
    const importName = toCamelCase(triggerId);
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `./triggers/${triggerId}`,
    });
  }
}

function addScheduledTriggerImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap
): void {
  for (const [scheduledTriggerId, referenceName] of referenceNames) {
    const importName = toCamelCase(scheduledTriggerId);
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `./scheduled-triggers/${scheduledTriggerId}`,
    });
  }
}

function extractStatusComponentIds(statusUpdates?: AgentOutput['statusUpdates']): string[] {
  if (!statusUpdates?.statusComponents?.length) {
    return [];
  }

  const statusComponentIds = statusUpdates.statusComponents.map(resolveStatusComponentId);
  return [...new Set(statusComponentIds)];
}

function resolveStatusComponentId(
  statusComponent: string | { id?: string; type?: string; name?: string }
): string {
  const id =
    typeof statusComponent === 'string'
      ? statusComponent
      : statusComponent.id || statusComponent.type;
  if (!id) {
    throw new Error(
      `Unable to resolve status component with id ${JSON.stringify(statusComponent)}`
    );
  }
  return id;
}

function addStatusComponentImports(sourceFile: SourceFile, referenceNames: ReferenceNameMap): void {
  for (const [statusComponentId, referenceName] of referenceNames) {
    const importName = toCamelCase(statusComponentId);
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `../status-components/${statusComponentId}`,
    });
  }
}

function createSubAgentReferenceMaps(
  ids: Iterable<string>,
  reservedNames: Set<string>,
  conflictSuffix: string,
  overrides?: AgentOutput['subAgentReferences']
): {
  referenceNames: ReferenceNameMap;
  importNames: ReferenceNameMap;
} {
  const referenceNames: ReferenceNameMap = new Map();
  const importNames: ReferenceNameMap = new Map();

  for (const id of ids) {
    if (referenceNames.has(id)) {
      continue;
    }

    const override = overrides?.[id];
    const importName = override?.name ?? toCamelCase(id);
    const isLocal = override?.local === true;
    const referenceName = isLocal
      ? importName
      : createUniqueReferenceName(importName, reservedNames, conflictSuffix);

    if (isLocal) {
      reservedNames.add(referenceName);
    } else {
      importNames.set(id, importName);
    }

    referenceNames.set(id, referenceName);
  }

  return { referenceNames, importNames };
}

function createReferenceNameMap(
  ids: Iterable<string>,
  reservedNames: Set<string>,
  conflictSuffix: string
): ReferenceNameMap {
  const map: ReferenceNameMap = new Map();
  for (const id of ids) {
    if (map.has(id)) {
      continue;
    }
    map.set(id, createUniqueReferenceName(toCamelCase(id), reservedNames, conflictSuffix));
  }
  return map;
}
