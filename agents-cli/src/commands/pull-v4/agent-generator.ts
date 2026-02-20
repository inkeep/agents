import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addReferenceGetterProperty,
  addStringProperty,
  collectTemplateVariableNames as collectTemplateVariableNamesFromString,
  createFactoryDefinition,
  formatStringLiteral,
  formatTemplate,
  isPlainObject,
  toCamelCase,
} from './utils';

const SubAgentReferenceSchema = z.object({
  name: z.string().nonempty(),
  local: z.boolean().optional(),
});

const AgentSchema = z.looseObject({
  agentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().nullish(),
  prompt: z.string().optional(),
  models: z.looseObject({}).optional(),
  defaultSubAgentId: z.string().nonempty(),
  subAgents: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]),
  contextConfig: z.union([z.string(), z.looseObject({ id: z.string().optional() })]).optional(),
  stopWhen: z
    .object({
      transferCountIs: z.int().optional(),
    })
    .optional(),
  statusUpdates: z
    .strictObject({
      numEvents: z.int().optional(),
      timeInSeconds: z.int().optional(),
      statusComponents: z
        .array(
          z.union([
            z.string(),
            z.looseObject({
              id: z.string().optional(),
              type: z.string(),
              name: z.string().optional(),
            }),
          ])
        )
        .optional(),
      prompt: z.string().optional(),
    })
    .optional(),
  credentials: z.array(z.union([z.string(), z.strictObject({ id: z.string() })])).optional(),
  triggers: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
  agentVariableName: z.string().nonempty().optional(),
  subAgentReferences: z.record(z.string(), SubAgentReferenceSchema).optional(),
  contextConfigReference: SubAgentReferenceSchema.optional(),
  contextConfigHeadersReference: SubAgentReferenceSchema.optional(),
});

type AgentDefinitionData = z.input<typeof AgentSchema>;
type ParsedAgentDefinitionData = z.infer<typeof AgentSchema>;
type ReferenceNameMap = Map<string, string>;

interface AgentReferenceNames {
  subAgents: ReferenceNameMap;
  contextConfig?: string;
  contextHeaders?: string;
  triggers: ReferenceNameMap;
  statusComponents: ReferenceNameMap;
}

export function generateAgentDefinition(data: AgentDefinitionData): SourceFile {
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
    statusComponents: statusComponentReferenceNames,
  });
  return sourceFile;
}

function writeAgentConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedAgentDefinitionData,
  referenceNames: AgentReferenceNames
) {
  addStringProperty(configObject, 'id', data.agentId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== undefined) {
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

function extractStatusComponentIds(
  statusUpdates?: ParsedAgentDefinitionData['statusUpdates']
): string[] {
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
  overrides?: ParsedAgentDefinitionData['subAgentReferences']
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

function createUniqueReferenceName(
  baseName: string,
  reservedNames: Set<string>,
  conflictSuffix: string
): string {
  if (!reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  const baseCandidate = `${baseName}${conflictSuffix}`;
  if (!reservedNames.has(baseCandidate)) {
    reservedNames.add(baseCandidate);
    return baseCandidate;
  }

  let index = 2;
  while (reservedNames.has(`${baseCandidate}${index}`)) {
    index += 1;
  }

  const uniqueName = `${baseCandidate}${index}`;
  reservedNames.add(uniqueName);
  return uniqueName;
}
