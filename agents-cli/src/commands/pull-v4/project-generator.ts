import type { ProjectConfig } from '@inkeep/agents-sdk';
import {
  IndentationText,
  NewLineKind,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { z } from 'zod';
import {
  formatInlineLiteral,
  formatPropertyName,
  formatStringLiteral,
  isPlainObject,
  toCamelCase,
} from './utils';

type ProjectDefinitionData = Omit<
  ProjectConfig,
  | 'id'
  | 'agents'
  | 'tools'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents'
  | 'credentialReferences'
> & {
  projectId: string;
  agents?: string[];
  tools?: string[];
  externalAgents?: string[];
  dataComponents?: string[];
  artifactComponents?: string[];
  credentialReferences?: string[];
};

const ProjectSchema = z.looseObject({
  projectId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
  models: z.looseObject({
    base: z.looseObject({
      model: z.string().nonempty(),
    }),
    structuredOutput: z.looseObject({}).optional(),
    summarizer: z.looseObject({}).optional(),
  }),
  stopWhen: z
    .strictObject({
      transferCountIs: z.int().optional(),
      stepCountIs: z.int().optional(),
    })
    .optional(),
  agents: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  externalAgents: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  credentialReferences: z.array(z.string()).optional(),
});

type ParsedProjectDefinitionData = z.infer<typeof ProjectSchema>;

export function generateProjectDefinition(data: ProjectDefinitionData): string {
  const result = ProjectSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Missing required fields for project:
${z.prettifyError(result.error)}`);
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: false,
    },
  });

  const parsed = result.data;
  const sourceFile = project.createSourceFile('project-definition.ts', '', { overwrite: true });
  sourceFile.addImportDeclaration({
    namedImports: ['project'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const projectVarName = toCamelCase(parsed.projectId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: projectVarName,
        initializer: 'project({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create variable declaration for project '${parsed.projectId}'`);
  }
  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeProjectConfig(configObject, parsed);

  return sourceFile.getFullText().trimEnd();
}

function writeProjectConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedProjectDefinitionData
) {
  addStringProperty(configObject, 'id', data.projectId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description) {
    addStringProperty(configObject, 'description', data.description);
  }

  addModelsProperty(configObject, data.models);

  if (hasStopWhen(data.stopWhen)) {
    addStopWhenProperty(configObject, data.stopWhen);
  }

  if (hasReferences(data.agents)) {
    addReferenceGetterProperty(configObject, 'agents', data.agents);
  }

  if (hasReferences(data.tools)) {
    addReferenceGetterProperty(configObject, 'tools', data.tools);
  }

  if (hasReferences(data.externalAgents)) {
    addReferenceGetterProperty(configObject, 'externalAgents', data.externalAgents);
  }

  if (hasReferences(data.dataComponents)) {
    addReferenceGetterProperty(configObject, 'dataComponents', data.dataComponents);
  }

  if (hasReferences(data.artifactComponents)) {
    addReferenceGetterProperty(configObject, 'artifactComponents', data.artifactComponents);
  }

  if (hasReferences(data.credentialReferences)) {
    addReferenceGetterProperty(configObject, 'credentialReferences', data.credentialReferences);
  }
}

function addStringProperty(configObject: ObjectLiteralExpression, key: string, value: string) {
  configObject.addPropertyAssignment({
    name: key,
    initializer: formatStringLiteral(value),
  });
}

function addModelsProperty(
  configObject: ObjectLiteralExpression,
  models: ParsedProjectDefinitionData['models']
) {
  const modelsProperty = configObject.addPropertyAssignment({
    name: 'models',
    initializer: '{}',
  });
  const modelsObject = modelsProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  addModelEntry(modelsObject, 'base', models.base);
  if (models.structuredOutput) {
    addModelEntry(modelsObject, 'structuredOutput', models.structuredOutput);
  }
  if (models.summarizer) {
    addModelEntry(modelsObject, 'summarizer', models.summarizer);
  }
}

function addModelEntry(
  modelsObject: ObjectLiteralExpression,
  key: string,
  value: Record<string, unknown>
) {
  const modelProperty = modelsObject.addPropertyAssignment({
    name: key,
    initializer: '{}',
  });
  const modelObject = modelProperty.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  addObjectEntries(modelObject, value);
}

function addStopWhenProperty(
  configObject: ObjectLiteralExpression,
  stopWhen: NonNullable<ParsedProjectDefinitionData['stopWhen']>
) {
  const stopWhenProperty = configObject.addPropertyAssignment({
    name: 'stopWhen',
    initializer: '{}',
  });
  const stopWhenObject = stopWhenProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  if (stopWhen.transferCountIs !== undefined) {
    stopWhenObject.addPropertyAssignment({
      name: 'transferCountIs',
      initializer: String(stopWhen.transferCountIs),
    });
  }
  if (stopWhen.stepCountIs !== undefined) {
    stopWhenObject.addPropertyAssignment({
      name: 'stepCountIs',
      initializer: String(stopWhen.stepCountIs),
    });
  }
}

function addReferenceGetterProperty(
  configObject: ObjectLiteralExpression,
  key: string,
  refs: string[]
) {
  const property = configObject.addPropertyAssignment({
    name: key,
    initializer: '() => []',
  });
  const getter = property.getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);
  const body = getter.getBody().asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  body.addElements(refs);
}

function addObjectEntries(target: ObjectLiteralExpression, value: Record<string, unknown>) {
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === undefined) {
      continue;
    }

    if (isPlainObject(entryValue)) {
      const property = target.addPropertyAssignment({
        name: formatPropertyName(key),
        initializer: '{}',
      });
      const nestedObject = property.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      addObjectEntries(nestedObject, entryValue);
      continue;
    }

    target.addPropertyAssignment({
      name: formatPropertyName(key),
      initializer: formatInlineLiteral(entryValue),
    });
  }
}

function hasStopWhen(
  stopWhen: ParsedProjectDefinitionData['stopWhen']
): stopWhen is NonNullable<ParsedProjectDefinitionData['stopWhen']> {
  if (!stopWhen) {
    return;
  }

  return stopWhen.transferCountIs !== undefined || stopWhen.stepCountIs !== undefined;
}

function hasReferences(references?: string[]): references is string[] {
  return Array.isArray(references) && references.length > 0;
}
