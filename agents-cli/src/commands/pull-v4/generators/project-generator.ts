import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { getObjectKeys } from '../collector-common';
import {
  collectProjectReferenceOverrides,
  collectProjectReferencePathOverrides,
} from '../collector-reference-helpers';
import type { GenerationTask } from '../generation-types';
import {
  addResolvedReferenceImports,
  resolveReferenceBindingsFromIds,
  toReferenceNames,
} from '../reference-resolution';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addValueToObject,
  codeExpression,
  createReferenceGetterValue,
  formatStringLiteral,
  hasReferences,
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
  return generateFactorySourceFile(data, {
    schema: ProjectSchema,
    factory: {
      importName: 'project',
      variableName: (parsed) => toCamelCase(parsed.projectId),
    },
    render({ parsed, sourceFile, configObject }) {
      const projectVariableName = toCamelCase(parsed.projectId);
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

      const projectConfig: Record<string, unknown> = {
        id: projectId,
        ...rest,
      };

      if (hasReferences(skills)) {
        projectConfig.skills = codeExpression(
          `() => loadSkills(path.join(${formatStringLiteral(projectId)}, 'skills'))`
        );
      }

      if (hasReferences(agents)) {
        const resolvedReferences = resolveReferenceBindingsFromIds({
          ids: agents,
          reservedNames: reservedReferenceNames,
          conflictSuffix: 'Agent',
          referenceOverrides: referenceOverrides?.agents,
          referencePathOverrides: referencePathOverrides?.agents,
        });
        addResolvedReferenceImports(sourceFile, resolvedReferences, (reference) => {
          return `./agents/${reference.modulePath}`;
        });
        projectConfig.agents = createReferenceGetterValue(toReferenceNames(resolvedReferences));
      }

      if (hasReferences(tools)) {
        const resolvedReferences = resolveReferenceBindingsFromIds({
          ids: tools,
          reservedNames: reservedReferenceNames,
          conflictSuffix: 'Tool',
          collisionStrategy: 'numeric-for-duplicates',
          referenceOverrides: referenceOverrides?.tools,
          referencePathOverrides: referencePathOverrides?.tools,
        });
        addResolvedReferenceImports(sourceFile, resolvedReferences, (reference) => {
          return `./tools/${reference.modulePath}`;
        });
        projectConfig.tools = createReferenceGetterValue(toReferenceNames(resolvedReferences));
      }

      if (hasReferences(externalAgents)) {
        const resolvedReferences = resolveReferenceBindingsFromIds({
          ids: externalAgents,
          reservedNames: reservedReferenceNames,
          conflictSuffix: 'ExternalAgent',
          referenceOverrides: referenceOverrides?.externalAgents,
          referencePathOverrides: referencePathOverrides?.externalAgents,
        });
        addResolvedReferenceImports(sourceFile, resolvedReferences, (reference) => {
          return `./external-agents/${reference.modulePath}`;
        });
        projectConfig.externalAgents = createReferenceGetterValue(
          toReferenceNames(resolvedReferences)
        );
      }

      if (hasReferences(dataComponents)) {
        const resolvedReferences = resolveReferenceBindingsFromIds({
          ids: dataComponents,
          reservedNames: reservedReferenceNames,
          conflictSuffix: 'DataComponent',
          referenceOverrides: referenceOverrides?.dataComponents,
          referencePathOverrides: referencePathOverrides?.dataComponents,
        });
        addResolvedReferenceImports(sourceFile, resolvedReferences, (reference) => {
          return `./data-components/${reference.modulePath}`;
        });
        projectConfig.dataComponents = createReferenceGetterValue(
          toReferenceNames(resolvedReferences)
        );
      }

      if (hasReferences(artifactComponents)) {
        const resolvedReferences = resolveReferenceBindingsFromIds({
          ids: artifactComponents,
          reservedNames: reservedReferenceNames,
          conflictSuffix: 'ArtifactComponent',
          referenceOverrides: referenceOverrides?.artifactComponents,
          referencePathOverrides: referencePathOverrides?.artifactComponents,
        });
        addResolvedReferenceImports(sourceFile, resolvedReferences, (reference) => {
          return `./artifact-components/${reference.modulePath}`;
        });
        projectConfig.artifactComponents = createReferenceGetterValue(
          toReferenceNames(resolvedReferences)
        );
      }

      if (hasReferences(credentialReferences)) {
        const resolvedReferences = resolveReferenceBindingsFromIds({
          ids: credentialReferences,
          reservedNames: reservedReferenceNames,
          conflictSuffix: 'CredentialReference',
          collisionStrategy: 'numeric',
          referenceOverrides: referenceOverrides?.credentialReferences,
          referencePathOverrides: referencePathOverrides?.credentialReferences,
        });
        addResolvedReferenceImports(sourceFile, resolvedReferences, (reference) => {
          return `./credentials/${reference.modulePath}`;
        });
        projectConfig.credentialReferences = createReferenceGetterValue(
          toReferenceNames(resolvedReferences)
        );
      }

      for (const [key, value] of Object.entries(projectConfig)) {
        addValueToObject(configObject, key, value);
      }
    },
  });
}

export const task = {
  type: 'project',
  collect(context) {
    const referenceOverrides = collectProjectReferenceOverrides(context);
    const referencePathOverrides = collectProjectReferencePathOverrides(context);

    return [
      {
        id: context.project.id,
        filePath: context.resolver.resolveOutputFilePath(
          'project',
          context.project.id,
          join(context.paths.projectRoot, 'index.ts')
        ),
        payload: {
          projectId: context.project.id,
          name: context.project.name,
          description: context.project.description,
          models: context.project.models,
          stopWhen: context.project.stopWhen,
          skills: getObjectKeys(context.project.skills),
          agents: [...context.completeAgentIds],
          tools: getObjectKeys(context.project.tools),
          externalAgents: getObjectKeys(context.project.externalAgents),
          dataComponents: getObjectKeys(context.project.dataComponents),
          artifactComponents: getObjectKeys(context.project.artifactComponents),
          credentialReferences: getObjectKeys(context.project.credentialReferences),
          ...(referenceOverrides && { referenceOverrides }),
          ...(referencePathOverrides && { referencePathOverrides }),
        } as Parameters<typeof generateProjectDefinition>[0],
      },
    ];
  },
  generate: generateProjectDefinition,
} satisfies GenerationTask<Parameters<typeof generateProjectDefinition>[0]>;
