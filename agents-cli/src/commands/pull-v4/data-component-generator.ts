import { type ObjectLiteralExpression, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addStringProperty,
  convertJsonSchemaToZodSafe,
  createFactoryDefinition,
  isPlainObject,
  toCamelCase,
} from './utils';

interface DataComponentDefinitionData {
  dataComponentId: string;
  name: string;
  description?: string | null;
  props?: unknown;
  schema?: unknown;
  render?: {
    component?: string;
    mockData?: Record<string, unknown>;
  } | null;
}

const DataComponentSchema = z.object({
  dataComponentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().nullable().optional(),
  props: z.unknown().optional(),
  schema: z.unknown().optional(),
  render: z
    .looseObject({
      component: z.string().optional(),
      mockData: z.looseObject({}).optional(),
    })
    .nullable()
    .optional(),
});

type ParsedDataComponentDefinitionData = z.infer<typeof DataComponentSchema>;

export function generateDataComponentDefinition(data: DataComponentDefinitionData): string {
  const result = DataComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for data component:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const props = parsed.props !== undefined ? parsed.props : parsed.schema;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'dataComponent',
    variableName: toCamelCase(parsed.dataComponentId),
  });

  if (props !== undefined) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  writeDataComponentConfig(configObject, parsed, props);

  return sourceFile.getFullText();
}

function writeDataComponentConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedDataComponentDefinitionData,
  props: unknown
): void {
  addStringProperty(configObject, 'id', data.dataComponentId);
  addStringProperty(configObject, 'name', data.name);

  if (typeof data.description === 'string') {
    addStringProperty(configObject, 'description', data.description);
  }

  if (props !== undefined) {
    configObject.addPropertyAssignment({
      name: 'props',
      initializer: convertJsonSchemaToZodSafe(props),
    });
  }

  if (data.render) {
    addRenderProperty(configObject, data.render);
  }
}

function addRenderProperty(
  configObject: ObjectLiteralExpression,
  render: NonNullable<ParsedDataComponentDefinitionData['render']>
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
