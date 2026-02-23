import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from '../utils';

interface CredentialDefinitionData {
  credentialId: string;
  name: string;
  type: string;
  credentialStoreId: string;
  description?: string | null;
  retrievalParams?: unknown;
}

const CredentialSchema = z.object({
  credentialId: z.string().nonempty(),
  name: z.string().nonempty(),
  type: z.string().nonempty(),
  credentialStoreId: z.string().nonempty(),
  description: z.string().optional(),
  retrievalParams: z.unknown().optional(),
});

export function generateCredentialDefinition(data: CredentialDefinitionData): SourceFile {
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
