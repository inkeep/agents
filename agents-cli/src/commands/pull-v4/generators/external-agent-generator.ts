import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.externalAgents.unwrap().valueType.omit({
  id: true,
});

const ExternalAgentSchema = z.strictObject({
  externalAgentId: z.string().nonempty(),
  externalAgentReferenceName: z.string().optional(),
  ...MySchema.shape,
});

type ExternalAgentInput = z.input<typeof ExternalAgentSchema>;

export function generateExternalAgentDefinition({
  id,
  tenantId,
  projectId,
  createdAt,
  updatedAt,
  ...data
}: ExternalAgentInput & Record<string, unknown>): SourceFile {
  const result = ExternalAgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for external agent:\n${z.prettifyError(result.error)}`);
  }

  const { externalAgentReferenceName, externalAgentId, credentialReferenceId, ...parsed } =
    result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'externalAgent',
    variableName: externalAgentReferenceName ?? toCamelCase(externalAgentId),
  });

  for (const [key, value] of Object.entries({
    id: externalAgentId,
    ...parsed,
  })) {
    addValueToObject(configObject, key, value);
  }
  if (credentialReferenceId) {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(credentialReferenceId)],
      moduleSpecifier: `../credentials/${credentialReferenceId}`,
    });
    configObject.addPropertyAssignment({
      name: 'credentialReference',
      initializer: toCamelCase(credentialReferenceId),
    });
  }
  return sourceFile;
}
