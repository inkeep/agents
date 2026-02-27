import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  convertJsonSchemaToZodSafe,
  convertNullToUndefined,
  createFactoryDefinition,
  formatPropertyName,
  formatStringLiteral,
  isPlainObject,
  toCamelCase,
} from '../utils';

interface ArtifactComponentDefinitionData {
  artifactComponentId: string;
  name: string;
  description?: string;
  props: Record<string, unknown>;
  schema?: Record<string, unknown>;
  template?: string;
  contentType?: string;
  render?: {
    component?: string;
    mockData?: Record<string, unknown>;
  };
}

const MySchema = FullProjectDefinitionSchema.shape.artifactComponents.unwrap().valueType.omit({
  id: true,
});

const ArtifactComponentSchema = MySchema.extend({
  artifactComponentId: z.string().nonempty(),
});

export function generateArtifactComponentDefinition(
  data: ArtifactComponentDefinitionData
): SourceFile {
  const result = ArtifactComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for artifact component:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const schema = parsed.props ?? parsed.schema;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'artifactComponent',
    variableName: toCamelCase(parsed.artifactComponentId),
  });

  if (hasInPreviewFields(schema)) {
    sourceFile.addImportDeclaration({
      namedImports: ['preview'],
      moduleSpecifier: '@inkeep/agents-core',
    });
  }
  if (schema) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const { artifactComponentId, schema: _, props: _2, ...rest } = parsed;

  for (const [key, value] of Object.entries({
    id: artifactComponentId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }
  if (schema) {
    configObject.addPropertyAssignment({
      name: 'props',
      initializer: formatArtifactSchema(schema),
    });
  }
  return sourceFile;
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
