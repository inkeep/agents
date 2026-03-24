import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addValueToObject,
  buildComponentFileName,
  createFactoryDefinition,
  createUniqueReferenceName,
  formatStringLiteral,
  hasReferences,
  resolveReferenceName,
  toCamelCase,
} from '../utils';

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  agents: ReferenceNameByIdSchema.optional(),
  tools: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
  dataComponents: ReferenceNameByIdSchema.optional(),
  artifactComponents: ReferenceNameByIdSchema.optional(),
  credentialReferences: ReferenceNameByIdSchema.optional(),
});

const ReferencePathOverridesSchema = z.object({
  agents: ReferenceNameByIdSchema.optional(),
  tools: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
  dataComponents: ReferenceNameByIdSchema.optional(),
  artifactComponents: ReferenceNameByIdSchema.optional(),
  credentialReferences: ReferenceNameByIdSchema.optional(),
});

interface ResolvedReference {
  id: string;
  importName: string;
  localName: string;
  modulePath: string;
}

type CollisionStrategy = 'descriptive' | 'numeric' | 'numeric-for-duplicates';

const MySchema = FullProjectDefinitionSchema.pick({
  name: true,
  description: true,
  models: true,
  stopWhen: true,
});

const ProjectSchema = z.strictObject({
  projectId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  // Invalid input: expected object, received null
  stopWhen: z.preprocess(
    (v) => (v && Object.keys(v).length && v) || undefined,
    MySchema.shape.stopWhen
  ),
  skills: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  externalAgents: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  credentialReferences: z.array(z.string()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
  referencePathOverrides: ReferencePathOverridesSchema.optional(),
});

type ProjectInput = z.input<typeof ProjectSchema>;

export function generateProjectDefinition(data: ProjectInput): SourceFile {
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
    referencePathOverrides,
    ...rest
  } = parsed;

  const credentialReferenceResolved = hasReferences(credentialReferences)
    ? createResolvedReferences(
        credentialReferences,
        referenceOverrides?.credentialReferences,
        referencePathOverrides?.credentialReferences,
        reservedReferenceNames,
        'CredentialReference',
        'numeric'
      )
    : undefined;

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
      referencePathOverrides?.agents,
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
      referencePathOverrides?.tools,
      reservedReferenceNames,
      'Tool',
      'numeric-for-duplicates'
    );
    addReferenceImports(sourceFile, resolvedReferences, './tools');
    addReferenceGetterProperty(configObject, 'tools', toReferenceNames(resolvedReferences));
  }

  if (hasReferences(externalAgents)) {
    const resolvedReferences = createResolvedReferences(
      externalAgents,
      referenceOverrides?.externalAgents,
      referencePathOverrides?.externalAgents,
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
      referencePathOverrides?.dataComponents,
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
      referencePathOverrides?.artifactComponents,
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
    const resolvedReferences = credentialReferenceResolved ?? [];
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
      moduleSpecifier: `${basePath}/${reference.modulePath}`,
    });
  }
}

function toReferenceNames(references: ResolvedReference[]): string[] {
  return references.map((reference) => reference.localName);
}

function createResolvedReferences(
  references: string[],
  referenceOverrides: Record<string, string> | undefined,
  referencePathOverrides: Record<string, string> | undefined,
  reservedReferenceNames: Set<string>,
  suffix: string,
  collisionStrategy: CollisionStrategy = 'descriptive'
): ResolvedReference[] {
  const seenIds = new Set<string>();
  const normalizedReferences: Array<{
    id: string;
    importName: string;
    modulePath: string;
  }> = [];

  for (const referenceId of references) {
    if (seenIds.has(referenceId)) {
      continue;
    }
    seenIds.add(referenceId);

    normalizedReferences.push({
      id: referenceId,
      importName: resolveReferenceName(referenceId, [referenceOverrides]),
      modulePath: resolveReferenceModulePath(referenceId, referencePathOverrides?.[referenceId]),
    });
  }

  const importNameCounts = new Map<string, number>();
  for (const reference of normalizedReferences) {
    importNameCounts.set(
      reference.importName,
      (importNameCounts.get(reference.importName) ?? 0) + 1
    );
  }

  return normalizedReferences.map((reference) => {
    const shouldUseNumeric =
      collisionStrategy === 'numeric' ||
      (collisionStrategy === 'numeric-for-duplicates' &&
        (importNameCounts.get(reference.importName) ?? 0) > 1);

    const localName = shouldUseNumeric
      ? createNumericReferenceName(reference.importName, reservedReferenceNames)
      : createUniqueReferenceName(reference.importName, reservedReferenceNames, suffix);

    return {
      id: reference.id,
      importName: reference.importName,
      localName,
      modulePath: reference.modulePath,
    };
  });
}

function createNumericReferenceName(baseName: string, reservedNames: Set<string>): string {
  if (!reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  let index = 1;
  while (reservedNames.has(`${baseName}${index}`)) {
    index += 1;
  }

  const uniqueName = `${baseName}${index}`;
  reservedNames.add(uniqueName);
  return uniqueName;
}

function resolveReferenceModulePath(
  referenceId: string,
  referencePathOverride: string | undefined
): string {
  if (referencePathOverride && referencePathOverride.length > 0) {
    return referencePathOverride.replace(/\.tsx?$/, '');
  }

  const fileName = buildComponentFileName(referenceId);
  return fileName.replace(/\.tsx?$/, '');
}
