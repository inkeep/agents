import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { asRecord, collectEnvironmentCredentialReferenceIds } from '../collector-common';
import type { GenerationTask } from '../generation-types';
import {
  generateSimpleFactoryDefinition,
  validateGeneratorInput,
} from '../simple-factory-generator';

const EnvironmentCredentialSchema = FullProjectDefinitionSchema.shape.credentialReferences
  .unwrap()
  .valueType.omit({
    createdBy: true,
    toolId: true,
    userId: true,
  });
const EnvironmentSettingsSchema = z.looseObject({
  credentials: z.record(z.string(), EnvironmentCredentialSchema).nullable().optional(),
});
type EnvironmentSettingsInput = z.input<typeof EnvironmentSettingsSchema>;

export function generateEnvironmentSettingsDefinition(
  environmentName: string,
  environmentData: EnvironmentSettingsInput
): SourceFile {
  const validatedEnvironmentName = validateGeneratorInput(environmentName, {
    schema: z.string().nonempty(),
    errorLabel: 'environment name',
  });

  return generateSimpleFactoryDefinition(environmentData, {
    schema: EnvironmentSettingsSchema,
    factory: {
      importName: 'registerEnvironmentSettings',
      variableName: () => validatedEnvironmentName,
    },
    buildConfig(parsed) {
      return {
        credentials: parsed.credentials ?? {},
      };
    },
  });
}

export const task = {
  type: 'environment-settings',
  collect(context) {
    const credentialReferenceIds = collectEnvironmentCredentialReferenceIds(context.project);
    if (credentialReferenceIds.length === 0) {
      return [];
    }

    const credentials: Record<string, unknown> = {};
    for (const credentialReferenceId of credentialReferenceIds) {
      const credentialData = context.project.credentialReferences?.[credentialReferenceId];
      const credentialRecord = asRecord(credentialData);
      credentials[credentialReferenceId] = credentialRecord
        ? { ...credentialRecord, id: credentialReferenceId }
        : { id: credentialReferenceId };
    }

    return [
      {
        id: 'development',
        filePath: context.resolver.resolveOutputFilePath(
          'environments',
          'development',
          join(context.paths.environmentsDir, 'development.env.ts')
        ),
        payload: {
          credentials,
        } as Parameters<typeof generateEnvironmentSettingsDefinition>[1],
      },
    ];
  },
  generate(payload) {
    return generateEnvironmentSettingsDefinition('development', payload);
  },
} satisfies GenerationTask<Parameters<typeof generateEnvironmentSettingsDefinition>[1]>;
