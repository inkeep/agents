import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.credentialReferences.unwrap().valueType.omit({
  id: true,
  createdBy: true,
});

const CredentialSchema = z.strictObject({
  credentialId: z.string().nonempty(),
  ...MySchema.shape,
});

type CredentialInput = z.input<typeof CredentialSchema>;

export function generateCredentialDefinition({
  tenantId,
  id,
  projectId,
  createdBy,
  createdAt,
  updatedAt,
  ...data
}: CredentialInput): SourceFile {
  const result = CredentialSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for credential:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const credentialVarName = toCamelCase(parsed.credentialId);
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'credential',
    variableName: credentialVarName,
  });

  const { credentialId, ...rest } = parsed;

  for (const [k, v] of Object.entries({ id: credentialId, ...rest })) {
    addValueToObject(configObject, k, v);
  }
  return sourceFile;
}
