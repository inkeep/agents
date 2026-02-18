import type { ProjectConfig } from '@inkeep/agents-sdk';
import { type SourceFile, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addValueToObject,
  createInMemoryProject,
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

export function generateProjectDefinition(data: ProjectDefinitionData): string {
  const result = ProjectSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for project:
${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();

  const parsed = result.data;
  const sourceFile = project.createSourceFile('project-definition.ts', '', { overwrite: true });
  const importName = 'project';
  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const projectVarName = toCamelCase(parsed.projectId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{ name: projectVarName, initializer: `${importName}({})` }],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create variable declaration for project '${parsed.projectId}'`);
  }
  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const {
    projectId,
    agents,
    tools,
    externalAgents,
    dataComponents,
    artifactComponents,
    credentialReferences,
    ...rest
  } = parsed;

  for (const [key, value] of Object.entries({
    id: projectId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }

  if (hasReferences(agents)) {
    addReferenceImports(sourceFile, agents, './agents');
    addReferenceGetterProperty(configObject, 'agents', toReferenceNames(agents));
  }

  if (hasReferences(tools)) {
    addReferenceGetterProperty(configObject, 'tools', tools);
  }

  if (hasReferences(externalAgents)) {
    addReferenceGetterProperty(configObject, 'externalAgents', externalAgents);
  }

  if (hasReferences(dataComponents)) {
    addReferenceImports(sourceFile, dataComponents, './data-components');
    addReferenceGetterProperty(configObject, 'dataComponents', toReferenceNames(dataComponents));
  }

  if (hasReferences(artifactComponents)) {
    addReferenceImports(sourceFile, artifactComponents, './artifact-components');
    addReferenceGetterProperty(
      configObject,
      'artifactComponents',
      toReferenceNames(artifactComponents)
    );
  }

  if (hasReferences(credentialReferences)) {
    addReferenceImports(sourceFile, credentialReferences, './credentials');
    addReferenceGetterProperty(
      configObject,
      'credentialReferences',
      toReferenceNames(credentialReferences)
    );
  }

  return sourceFile.getFullText();
}

function hasReferences(references?: string[]): references is string[] {
  return Array.isArray(references) && references.length > 0;
}

function addReferenceImports(sourceFile: SourceFile, references: string[], basePath: string): void {
  for (const reference of references) {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(reference)],
      moduleSpecifier: `${basePath}/${reference}`,
    });
  }
}

function toReferenceNames(references: string[]): string[] {
  return references.map((reference) => toCamelCase(reference));
}
