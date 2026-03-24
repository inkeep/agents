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

export function generateStatusComponentDefinition({
  id,
  ...data
}: StatusComponentInput & Record<string, unknown>): SourceFile {
  const result = StatusComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for status component:\n${z.prettifyError(result.error)}`);
  }

  const { statusComponentId, detailsSchema, ...rest } = result.data;

  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'statusComponent',
    variableName: toCamelCase(statusComponentId),
  });

  for (const [k, v] of Object.entries(rest)) {
    addValueToObject(configObject, k, v);
  }
  if (detailsSchema) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
    configObject.addPropertyAssignment({
      name: 'detailsSchema',
      initializer: convertJsonSchemaToZodSafe(detailsSchema),
    });
  }

  return sourceFile;
}
