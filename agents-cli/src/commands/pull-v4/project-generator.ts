import type { ProjectConfig } from '@inkeep/agents-sdk';
import { type SourceFile, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addValueToObject,
  createInMemoryProject,
  TransformToUndefined,
  toCamelCase,
} from './utils';

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  agents: ReferenceNameByIdSchema.optional(),
  tools: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
  dataComponents: ReferenceNameByIdSchema.optional(),
  artifactComponents: ReferenceNameByIdSchema.optional(),
  credentialReferences: ReferenceNameByIdSchema.optional(),
});

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
  referenceOverrides?: z.infer<typeof ReferenceOverridesSchema>;
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
  stopWhen: TransformToUndefined.pipe(
    z
      .strictObject({
        transferCountIs: z.int().optional(),
        stepCountIs: z.int().optional(),
      })
      .optional()
  ),
  agents: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  externalAgents: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  credentialReferences: z.array(z.string()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
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
    referenceOverrides,
    ...rest
  } = parsed;

  for (const [key, value] of Object.entries({
    id: projectId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }

  if (hasReferences(agents)) {
    addReferenceImports(sourceFile, agents, './agents', referenceOverrides?.agents);
    addReferenceGetterProperty(
      configObject,
      'agents',
      toReferenceNames(agents, referenceOverrides?.agents)
    );
  }

  if (hasReferences(tools)) {
    addReferenceImports(sourceFile, tools, './tools', referenceOverrides?.tools);
    addReferenceGetterProperty(
      configObject,
      'tools',
      toReferenceNames(tools, referenceOverrides?.tools)
    );
  }

  if (hasReferences(externalAgents)) {
    addReferenceImports(
      sourceFile,
      externalAgents,
      './external-agents',
      referenceOverrides?.externalAgents
    );
    addReferenceGetterProperty(
      configObject,
      'externalAgents',
      toReferenceNames(externalAgents, referenceOverrides?.externalAgents)
    );
  }

  if (hasReferences(dataComponents)) {
    addReferenceImports(
      sourceFile,
      dataComponents,
      './data-components',
      referenceOverrides?.dataComponents
    );
    addReferenceGetterProperty(
      configObject,
      'dataComponents',
      toReferenceNames(dataComponents, referenceOverrides?.dataComponents)
    );
  }

  if (hasReferences(artifactComponents)) {
    addReferenceImports(
      sourceFile,
      artifactComponents,
      './artifact-components',
      referenceOverrides?.artifactComponents
    );
    addReferenceGetterProperty(
      configObject,
      'artifactComponents',
      toReferenceNames(artifactComponents, referenceOverrides?.artifactComponents)
    );
  }

  if (hasReferences(credentialReferences)) {
    addReferenceImports(
      sourceFile,
      credentialReferences,
      './credentials',
      referenceOverrides?.credentialReferences
    );
    addReferenceGetterProperty(
      configObject,
      'credentialReferences',
      toReferenceNames(credentialReferences, referenceOverrides?.credentialReferences)
    );
  }

  return sourceFile.getFullText();
}

function hasReferences(references?: string[]): references is string[] {
  return Array.isArray(references) && references.length > 0;
}

function addReferenceImports(
  sourceFile: SourceFile,
  references: string[],
  basePath: string,
  referenceOverrides?: Record<string, string>
): void {
  for (const reference of references) {
    const referenceName = resolveReferenceName(reference, referenceOverrides);
    sourceFile.addImportDeclaration({
      namedImports: [referenceName],
      moduleSpecifier: `${basePath}/${reference}`,
    });
  }
}

function toReferenceNames(
  references: string[],
  referenceOverrides?: Record<string, string>
): string[] {
  return references.map((reference) => resolveReferenceName(reference, referenceOverrides));
}

function resolveReferenceName(
  referenceId: string,
  referenceOverrides?: Record<string, string>
): string {
  return referenceOverrides?.[referenceId] ?? toCamelCase(referenceId);
}
