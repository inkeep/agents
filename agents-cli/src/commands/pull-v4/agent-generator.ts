import {
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addReferenceGetterProperty,
  addStringProperty,
  createInMemoryProject,
  formatStringLiteral,
  isPlainObject,
  toCamelCase,
} from './utils';

const AgentSchema = z.looseObject({
  agentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
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
            z.strictObject({
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
});

type AgentDefinitionData = z.input<typeof AgentSchema>;
type ParsedAgentDefinitionData = z.infer<typeof AgentSchema>;

export function generateAgentDefinition(data: AgentDefinitionData): string {
  const result = AgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Missing required fields for agent:\n${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();

  const parsed = result.data;
  const sourceFile = project.createSourceFile('agent-definition.ts', '', { overwrite: true });
  sourceFile.addImportDeclaration({
    namedImports: ['agent'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const subAgentIds = new Set(extractIds(parsed.subAgents));
  subAgentIds.add(parsed.defaultSubAgentId);
  addSubAgentImports(sourceFile, subAgentIds);
  const contextConfigId = extractContextConfigId(parsed.contextConfig);
  if (contextConfigId) {
    addContextConfigImport(sourceFile, contextConfigId);
  }
  const triggerIds = parsed.triggers ? extractIds(parsed.triggers) : [];
  addTriggerImports(sourceFile, triggerIds);
  addStatusComponentImports(sourceFile, extractStatusComponentIds(parsed.statusUpdates));

  const agentVarName = toCamelCase(parsed.agentId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: agentVarName,
        initializer: 'agent({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create variable declaration for agent '${parsed.agentId}'`);
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeAgentConfig(configObject, parsed);

  return sourceFile.getFullText().trimEnd();
}

function writeAgentConfig(configObject: ObjectLiteralExpression, data: ParsedAgentDefinitionData) {
  addStringProperty(configObject, 'id', data.agentId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  }

  if (data.prompt !== undefined) {
    addStringProperty(configObject, 'prompt', data.prompt);
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
    initializer: toCamelCase(data.defaultSubAgentId),
  });

  const subAgentIds = extractIds(data.subAgents);
  addReferenceGetterProperty(
    configObject,
    'subAgents',
    subAgentIds.map((id) => toCamelCase(id))
  );

  const contextConfigId = extractContextConfigId(data.contextConfig);
  if (contextConfigId) {
    configObject.addPropertyAssignment({
      name: 'contextConfig',
      initializer: toCamelCase(contextConfigId),
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
      triggerIds.map((id) => toCamelCase(id))
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
        (statusComponent) => `${toCamelCase(resolveStatusComponentId(statusComponent))}.config`
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
      statusUpdatesObject.addPropertyAssignment({
        name: 'prompt',
        initializer: formatStringLiteral(data.statusUpdates.prompt),
      });
    }
  }
}

function extractIds(value: string[] | Record<string, unknown>): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (isPlainObject(item) && typeof item.id === 'string') {
          return item.id;
        }
        return;
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

function addSubAgentImports(sourceFile: SourceFile, subAgentIds: Set<string>): void {
  for (const subAgentId of subAgentIds) {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(subAgentId)],
      moduleSpecifier: `./sub-agents/${subAgentId}`,
    });
  }
}

function addContextConfigImport(sourceFile: SourceFile, contextConfigId: string): void {
  sourceFile.addImportDeclaration({
    namedImports: [toCamelCase(contextConfigId)],
    moduleSpecifier: `../context-configs/${contextConfigId}`,
  });
}

function addTriggerImports(sourceFile: SourceFile, triggerIds: string[]): void {
  const uniqueTriggerIds = new Set(triggerIds);
  for (const triggerId of uniqueTriggerIds) {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(triggerId)],
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

  const statusComponentIds = statusUpdates.statusComponents
    .map(resolveStatusComponentId)
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

function addStatusComponentImports(sourceFile: SourceFile, statusComponentIds: string[]): void {
  const uniqueStatusComponentIds = new Set(statusComponentIds);
  for (const statusComponentId of uniqueStatusComponentIds) {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(statusComponentId)],
      moduleSpecifier: `../status-components/${statusComponentId}`,
    });
  }
}
