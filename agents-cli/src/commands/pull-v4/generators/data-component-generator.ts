import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addStringProperty,
  addValueToObject,
  convertJsonSchemaToZodSafe,
  createFactoryDefinition,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.dataComponents.unwrap().valueType.omit({
  id: true,
});

const DataComponentSchema = z.strictObject({
  dataComponentId: z.string().nonempty(),
  ...MySchema.shape,
});

type DataComponentInput = z.input<typeof DataComponentSchema>;
type DataComponentOutput = z.output<typeof DataComponentSchema>;

export function generateDataComponentDefinition(data: DataComponentInput): SourceFile {
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

  return sourceFile;
}

function writeDataComponentConfig(
  configObject: ObjectLiteralExpression,
  data: DataComponentOutput,
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
  render: NonNullable<DataComponentOutput['render']>
): void {
  if (render.component) {
    addValueToObject(configObject, 'render', {
      component: render.component,
      mockData: render.mockData,
    });
  }
}
