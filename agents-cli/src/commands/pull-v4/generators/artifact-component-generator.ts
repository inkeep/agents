import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import type { GenerationTask } from '../generation-types';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addValueToObject,
  buildComponentFileName,
  codeExpression,
  convertJsonSchemaToZodSafe,
  formatPropertyName,
  formatStringLiteral,
  isPlainObject,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.artifactComponents.unwrap().valueType.omit({
  id: true,
});

const ArtifactComponentSchema = z.strictObject({
  artifactComponentId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  render: z.preprocess((v) => v ?? undefined, MySchema.shape.render),
  // Invalid input
  props: z.unknown(),
});

type ArtifactComponentInput = z.input<typeof ArtifactComponentSchema>;

export function generateArtifactComponentDefinition({
  tenantId,
  id,
  projectId,
  createdAt,
  updatedAt,
  ...data
}: ArtifactComponentInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: ArtifactComponentSchema,
    factory: {
      importName: 'artifactComponent',
      variableName: (parsed) => toCamelCase(parsed.artifactComponentId),
    },
    render({ parsed, sourceFile, configObject }) {
      const schema = parsed.props;

      if (hasInPreviewFields(schema)) {
        sourceFile.addImportDeclaration({
          namedImports: ['preview'],
          moduleSpecifier: '@inkeep/agents-core',
        });
      }
      if (schema) {
        sourceFile.addImportDeclaration({ namedImports: ['z'], moduleSpecifier: 'zod' });
      }

      const { artifactComponentId, props: _, ...rest } = parsed;

      for (const [key, value] of Object.entries({
        id: artifactComponentId,
        ...rest,
      })) {
        addValueToObject(configObject, key, value);
      }
      if (schema) {
        addValueToObject(configObject, 'props', codeExpression(formatArtifactSchema(schema)));
      }
    },
  });
}

function hasInPreviewFields(schema: unknown): boolean {
  if (!isPlainObject(schema) || schema.type !== 'object' || !isPlainObject(schema.properties)) {
    return false;
  }

  return Object.values(schema.properties).some(
    (property) => isPlainObject(property) && property.inPreview === true
  );
}

function formatArtifactSchema(schema: unknown): string {
  if (!isPlainObject(schema)) {
    return 'z.any()';
  }

  if (schema.type === 'object' && isPlainObject(schema.properties)) {
    const lines = ['z.object({'];

    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      const propertyWithoutPreview = isPlainObject(propertySchema)
        ? { ...propertySchema }
        : propertySchema;

      if (isPlainObject(propertyWithoutPreview)) {
        delete propertyWithoutPreview.inPreview;
      }

      const zodType = convertJsonSchemaToZodSafe(propertyWithoutPreview);
      const propertyValue =
        isPlainObject(propertySchema) && propertySchema.inPreview === true
          ? `preview(${zodType})`
          : zodType;

      lines.push(`  ${formatPropertyName(key)}: ${propertyValue},`);
    }

    lines.push('})');

    if (typeof schema.description === 'string') {
      return `${lines.join('\n')}.describe(${formatStringLiteral(schema.description)})`;
    }

    return lines.join('\n');
  }

  return convertJsonSchemaToZodSafe(schema);
}

export const task = {
  type: 'artifact-component',
  collect(context) {
    if (!context.project.artifactComponents) {
      return [];
    }

    return Object.entries(context.project.artifactComponents).map(
      ([artifactComponentId, artifactComponentData]) => ({
        id: artifactComponentId,
        filePath: context.resolver.resolveOutputFilePath(
          'artifactComponents',
          artifactComponentId,
          join(
            context.paths.artifactComponentsDir,
            buildComponentFileName(artifactComponentId, artifactComponentData.name ?? undefined)
          )
        ),
        payload: {
          artifactComponentId,
          ...artifactComponentData,
        } as Parameters<typeof generateArtifactComponentDefinition>[0],
      })
    );
  },
  generate: generateArtifactComponentDefinition,
} satisfies GenerationTask<Parameters<typeof generateArtifactComponentDefinition>[0]>;
