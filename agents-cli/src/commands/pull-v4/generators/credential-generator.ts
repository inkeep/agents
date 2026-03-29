import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { buildSequentialNameFileNames } from '../generation-resolver';
import type { GenerationTask } from '../generation-types';
import { generateSimpleFactoryDefinition } from '../simple-factory-generator';
import { toCredentialReferenceName } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.credentialReferences.unwrap().valueType.omit({
  id: true,
  createdBy: true,
  toolId: true,
  userId: true,
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
  toolId,
  userId,
  ...data
}: CredentialInput & Record<string, unknown>): SourceFile {
  return generateSimpleFactoryDefinition(data, {
    schema: CredentialSchema,
    factory: {
      importName: 'credential',
      variableName: (parsed) => toCredentialReferenceName(parsed.name),
    },
    buildConfig(parsed) {
      const { credentialId, ...rest } = parsed;
      return {
        id: credentialId,
        ...rest,
      };
    },
  });
}

export const task = {
  type: 'credential',
  collect(context) {
    if (!context.project.credentialReferences) {
      return [];
    }

    const credentialEntries = Object.entries(context.project.credentialReferences);
    const fileNamesByCredentialId = buildSequentialNameFileNames(credentialEntries);

    return credentialEntries.map(([credentialId, credentialData]) => ({
      id: credentialId,
      filePath: context.resolver.resolveOutputFilePath(
        'credentials',
        credentialId,
        join(context.paths.credentialsDir, fileNamesByCredentialId[credentialId])
      ),
      payload: {
        credentialId,
        ...credentialData,
      } as Parameters<typeof generateCredentialDefinition>[0],
    }));
  },
  generate: generateCredentialDefinition,
} satisfies GenerationTask<Parameters<typeof generateCredentialDefinition>[0]>;
