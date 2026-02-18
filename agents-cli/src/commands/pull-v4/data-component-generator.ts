import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addStringProperty,
  convertJsonSchemaToZodSafe,
  createInMemoryProject,
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

const DataComponentSchema = z.looseObject({
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
    throw new Error(
      `Missing required fields for data component:\n${z.prettifyError(result.error)}`
    );
  }

  const parsed = result.data;
  const props = parsed.props !== undefined ? parsed.props : parsed.schema;
  const project = createInMemoryProject();
  const sourceFile = project.createSourceFile('data-component-definition.ts', '', {
    overwrite: true,
  });

  sourceFile.addImportDeclaration({
    namedImports: ['dataComponent'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  if (props !== undefined) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const dataComponentVarName = toCamelCase(parsed.dataComponentId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: dataComponentVarName,
        initializer: 'dataComponent({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for data component '${parsed.dataComponentId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeDataComponentConfig(configObject, parsed, props);

  return sourceFile.getFullText().trimEnd();
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
