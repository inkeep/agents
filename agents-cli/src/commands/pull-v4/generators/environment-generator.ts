import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition } from '../utils';

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

const EnvironmentIndexSchema = z.array(z.string());

type EnvironmentSettingsInput = z.input<typeof EnvironmentSettingsSchema>;
type EnvironmentIndexInput = z.input<typeof EnvironmentIndexSchema>;

export function generateEnvironmentSettingsDefinition(
  environmentName: string,
  environmentData: EnvironmentSettingsInput
): SourceFile {
  const environmentNameSchema = z.string().nonempty();
  const environmentNameResult = environmentNameSchema.safeParse(environmentName);
  if (!environmentNameResult.success) {
    throw new Error(
      `Validation failed for environment name:\n${z.prettifyError(environmentNameResult.error)}`
    );
  }

  const result = EnvironmentSettingsSchema.safeParse(environmentData);
  if (!result.success) {
    throw new Error(
      `Validation failed for environment settings:\n${z.prettifyError(result.error)}`
    );
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'registerEnvironmentSettings',
    variableName: environmentNameResult.data,
  });

  addValueToObject(configObject, 'credentials', parsed.credentials ?? {});

  return sourceFile;
}

export function generateEnvironmentIndexDefinition(
  environments: EnvironmentIndexInput
): SourceFile {
  const result = EnvironmentIndexSchema.safeParse(environments);
  if (!result.success) {
    throw new Error(`Validation failed for environments index:\n${z.prettifyError(result.error)}`);
  }

  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'createEnvironmentSettings',
    variableName: 'envSettings',
  });

  for (const environmentName of result.data) {
    sourceFile.addImportDeclaration({
      namedImports: [environmentName],
      moduleSpecifier: `./${environmentName}.env`,
    });
  }

  for (const environmentName of result.data) {
    configObject.addShorthandPropertyAssignment({ name: environmentName });
  }

  return sourceFile;
}
