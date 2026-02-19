import { SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  convertJsonSchemaToZodSafe,
  createInMemoryProject,
  formatPropertyName,
  formatStringLiteral,
  isPlainObject,
  toCamelCase,
  TransformToUndefined,
} from './utils';

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

const ArtifactComponentSchema = z.object({
  artifactComponentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
  props: z.looseObject({}),
  schema: z.looseObject({}).optional(),
  template: z.string().optional(),
  contentType: z.string().optional(),
  render: TransformToUndefined.pipe(
    z
      .looseObject({
        component: z.string().optional(),
        mockData: z.looseObject({}).optional(),
      })
      .optional()
  ),
});

export function generateArtifactComponentDefinition(data: ArtifactComponentDefinitionData): string {
  const result = ArtifactComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for artifact component:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const schema = parsed.props ?? parsed.schema;
  const project = createInMemoryProject();

  const sourceFile = project.createSourceFile('artifact-component-definition.ts', '', {
    overwrite: true,
  });

  if (hasInPreviewFields(schema)) {
    sourceFile.addImportDeclaration({
      namedImports: ['preview'],
      moduleSpecifier: '@inkeep/agents-core',
    });
  }
  const importName = 'artifactComponent';

  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  if (schema) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const artifactComponentVarName = toCamelCase(parsed.artifactComponentId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{ name: artifactComponentVarName, initializer: `${importName}({})` }],
  });

  const [declaration] = variableStatement.getDeclarations();
  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

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

  return sourceFile.getFullText();
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
