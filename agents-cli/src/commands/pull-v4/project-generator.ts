import type { ProjectConfig } from '@inkeep/agents-sdk';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addValueToObject,
  convertNullToUndefined,
  createFactoryDefinition,
  createUniqueReferenceName,
  formatStringLiteral,
  hasReferences,
  resolveReferenceName,
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
  | 'skills'
  | 'agents'
  | 'tools'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents'
  | 'credentialReferences'
> & {
  projectId: string;
  skills?: string[];
  agents?: string[];
  tools?: string[];
  externalAgents?: string[];
  dataComponents?: string[];
  artifactComponents?: string[];
  credentialReferences?: string[];
  referenceOverrides?: z.infer<typeof ReferenceOverridesSchema>;
};

interface ResolvedReference {
  id: string;
  importName: string;
  localName: string;
}

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
  stopWhen: z.preprocess(
    convertNullToUndefined,
    z
      .strictObject({
        transferCountIs: z.int().optional(),
        stepCountIs: z.int().optional(),
      })
      .optional()
  ),
  skills: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  externalAgents: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  credentialReferences: z.array(z.string()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
});

export function generateProjectDefinition(data: ProjectDefinitionData): SourceFile {
  const result = ProjectSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for project:
${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const projectVariableName = toCamelCase(parsed.projectId);
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'project',
    variableName: projectVariableName,
  });
  const reservedReferenceNames = new Set([projectVariableName]);
  if (hasReferences(parsed.skills)) {
    sourceFile.getImportDeclarationOrThrow('@inkeep/agents-sdk').addNamedImport('loadSkills');
    sourceFile.addImportDeclaration({
      defaultImport: 'path',
      moduleSpecifier: 'node:path',
    });
  }

  const {
    projectId,
    skills,
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

  if (hasReferences(skills)) {
    configObject.addPropertyAssignment({
      name: 'skills',
      initializer: `() => loadSkills(path.join(${formatStringLiteral(projectId)}, 'skills'))`,
    });
  }

  if (hasReferences(agents)) {
    const resolvedReferences = createResolvedReferences(
      agents,
      referenceOverrides?.agents,
      reservedReferenceNames,
      'Agent'
    );
    addReferenceImports(sourceFile, resolvedReferences, './agents');
    addReferenceGetterProperty(configObject, 'agents', toReferenceNames(resolvedReferences));
  }

  if (hasReferences(tools)) {
    const resolvedReferences = createResolvedReferences(
      tools,
      referenceOverrides?.tools,
      reservedReferenceNames,
      'Tool'
    );
    addReferenceImports(sourceFile, resolvedReferences, './tools');
    addReferenceGetterProperty(configObject, 'tools', toReferenceNames(resolvedReferences));
  }

  if (hasReferences(externalAgents)) {
    const resolvedReferences = createResolvedReferences(
      externalAgents,
      referenceOverrides?.externalAgents,
      reservedReferenceNames,
      'ExternalAgent'
    );
    addReferenceImports(sourceFile, resolvedReferences, './external-agents');
    addReferenceGetterProperty(
      configObject,
      'externalAgents',
      toReferenceNames(resolvedReferences)
    );
  }

  if (hasReferences(dataComponents)) {
    const resolvedReferences = createResolvedReferences(
      dataComponents,
      referenceOverrides?.dataComponents,
      reservedReferenceNames,
      'DataComponent'
    );
    addReferenceImports(sourceFile, resolvedReferences, './data-components');
    addReferenceGetterProperty(
      configObject,
      'dataComponents',
      toReferenceNames(resolvedReferences)
    );
  }

  if (hasReferences(artifactComponents)) {
    const resolvedReferences = createResolvedReferences(
      artifactComponents,
      referenceOverrides?.artifactComponents,
      reservedReferenceNames,
      'ArtifactComponent'
    );
    addReferenceImports(sourceFile, resolvedReferences, './artifact-components');
    addReferenceGetterProperty(
      configObject,
      'artifactComponents',
      toReferenceNames(resolvedReferences)
    );
  }

  if (hasReferences(credentialReferences)) {
    const resolvedReferences = createResolvedReferences(
      credentialReferences,
      referenceOverrides?.credentialReferences,
      reservedReferenceNames,
      'CredentialReference'
    );
    addReferenceImports(sourceFile, resolvedReferences, './credentials');
    addReferenceGetterProperty(
      configObject,
      'credentialReferences',
      toReferenceNames(resolvedReferences)
    );
  }

  return sourceFile;
}

function addReferenceImports(
  sourceFile: SourceFile,
  references: ResolvedReference[],
  basePath: string
): void {
  for (const reference of references) {
    sourceFile.addImportDeclaration({
      namedImports: [
        reference.importName === reference.localName
          ? reference.importName
          : { name: reference.importName, alias: reference.localName },
      ],
      moduleSpecifier: `${basePath}/${reference.id}`,
    });
  }
}

function toReferenceNames(references: ResolvedReference[]): string[] {
  return references.map((reference) => reference.localName);
}

function createResolvedReferences(
  references: string[],
  referenceOverrides: Record<string, string> | undefined,
  reservedReferenceNames: Set<string>,
  suffix: string
): ResolvedReference[] {
  const seenIds = new Set<string>();
  const resolvedReferences: ResolvedReference[] = [];

  for (const referenceId of references) {
    if (seenIds.has(referenceId)) {
      continue;
    }
    seenIds.add(referenceId);

    const importName = resolveReferenceName(referenceId, [referenceOverrides]);
    const localName = createUniqueReferenceName(importName, reservedReferenceNames, suffix);

    resolvedReferences.push({
      id: referenceId,
      importName,
      localName,
    });
  }

  return resolvedReferences;
}
