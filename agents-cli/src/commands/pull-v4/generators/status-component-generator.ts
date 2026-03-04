import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  convertJsonSchemaToZodSafe,
  createFactoryDefinition,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.statusUpdates
  .unwrap()
  .shape.statusComponents.unwrap().element;

const StatusComponentSchema = z.strictObject({
  statusComponentId: z.string().nonempty(),
  ...MySchema.shape,
});

type StatusComponentInput = z.input<typeof StatusComponentSchema>;

export function generateStatusComponentDefinition(data: StatusComponentInput): SourceFile {
  const result = StatusComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for status component:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const detailsSchema = parsed.detailsSchema !== undefined ? parsed.detailsSchema : parsed.schema;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'statusComponent',
    variableName: toCamelCase(parsed.statusComponentId),
  });

  if (detailsSchema !== undefined) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const { statusComponentId, id, detailsSchema: _, schema: _2, ...rest } = parsed;

  for (const [k, v] of Object.entries(rest)) {
    addValueToObject(configObject, k, v);
  }
  if (detailsSchema) {
    configObject.addPropertyAssignment({
      name: 'detailsSchema',
      initializer: convertJsonSchemaToZodSafe(detailsSchema),
    });
  }

  return sourceFile;
}
