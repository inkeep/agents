import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';

import {
  addObjectEntries,
  addStringProperty,
  convertJsonSchemaToZodSafe,
  createInMemoryProject,
  formatPropertyName,
  formatStringLiteral,
  isPlainObject,
  toCamelCase,
  toCamelCaseOrFallback,
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

const ArtifactComponentSchema = z.looseObject({
  artifactComponentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
  props: z.looseObject({}),
  schema: z.looseObject({}).optional(),
  template: z.string().optional(),
  contentType: z.string().optional(),
  render: z
    .looseObject({
      component: z.string().optional(),
      mockData: z.looseObject({}).optional(),
    })
    .optional(),
});

type ParsedArtifactComponentDefinitionData = z.infer<typeof ArtifactComponentSchema>;

export function generateArtifactComponentDefinition(data: ArtifactComponentDefinitionData): string {
  const result = ArtifactComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Missing required fields for artifact component:\n${z.prettifyError(result.error)}`
    );
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

  sourceFile.addImportDeclaration({
    namedImports: ['artifactComponent'],
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
    declarations: [
      {
        name: artifactComponentVarName,
        initializer: 'artifactComponent({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for artifact component '${parsed.artifactComponentId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeArtifactComponentConfig(configObject, parsed);

  return sourceFile.getFullText().trimEnd();
}

function writeArtifactComponentConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedArtifactComponentDefinitionData
): void {
  addStringProperty(configObject, 'id', data.artifactComponentId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  }

  const schema = data.props ?? data.schema;
  if (schema) {
    configObject.addPropertyAssignment({
      name: 'props',
      initializer: formatArtifactSchema(schema),
    });
  }

  if (data.render) {
    addRenderProperty(configObject, data.render);
  }

  if (data.template !== undefined) {
    configObject.addPropertyAssignment({
      name: 'template',
      initializer: formatStringLiteral(data.template),
    });
  }

  if (data.contentType !== undefined) {
    addStringProperty(configObject, 'contentType', data.contentType);
  }
}

function addRenderProperty(
  configObject: ObjectLiteralExpression,
  render: NonNullable<ParsedArtifactComponentDefinitionData['render']>
): void {
  const renderProperty = configObject.addPropertyAssignment({
    name: 'render',
    initializer: '{}',
  });
  const renderObject = renderProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  if (render.component !== undefined) {
    addStringProperty(renderObject, 'component', render.component);
  }

  if (render.mockData && isPlainObject(render.mockData)) {
    const mockDataProperty = renderObject.addPropertyAssignment({
      name: 'mockData',
      initializer: '{}',
    });
    const mockDataObject = mockDataProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    addObjectEntries(mockDataObject, render.mockData);
  }
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
