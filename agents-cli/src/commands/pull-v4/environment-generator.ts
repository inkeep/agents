import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addStringProperty,
  createFactoryDefinition,
  formatInlineLiteral,
  formatPropertyName,
  isPlainObject,
} from './utils';

interface EnvironmentSettingsData {
  credentials?: unknown;
}

interface EnvironmentCredentialData {
  id?: string;
  name?: string | null;
  type?: unknown;
  credentialStoreId?: string;
  description?: string | null;
  retrievalParams?: unknown;
}

const EnvironmentSettingsSchema = z.looseObject({
  credentials: z.record(z.string(), z.unknown()).nullable().optional(),
});

const EnvironmentIndexSchema = z.array(z.string());

export function generateEnvironmentSettingsImports(
  environmentData: EnvironmentSettingsData
): string[] {
  const imports = [`import { registerEnvironmentSettings } from '@inkeep/agents-sdk';`];
  if (needsCredentialStoreType(environmentData)) {
    imports.push(`import { CredentialStoreType } from '@inkeep/agents-core';`);
  }
  return imports;
}

export function generateEnvironmentIndexImports(environments: string[]): string[] {
  const result = EnvironmentIndexSchema.safeParse(environments);
  if (!result.success) {
    throw new Error(`Validation failed for environments index:\n${z.prettifyError(result.error)}`);
  }

  const imports = [`import { createEnvironmentSettings } from '@inkeep/agents-sdk';`];
  for (const environmentName of result.data) {
    imports.push(`import { ${environmentName} } from './${environmentName}.env';`);
  }
  return imports;
}

export function generateEnvironmentSettingsDefinition(
  environmentName: string,
  environmentData: EnvironmentSettingsData
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

  const hasCredentialStoreType = needsCredentialStoreType(parsed);
  if (hasCredentialStoreType) {
    sourceFile.addImportDeclaration({
      namedImports: ['CredentialStoreType'],
      moduleSpecifier: '@inkeep/agents-core',
    });
  }

  addCredentialsProperty(configObject, parsed.credentials, hasCredentialStoreType);

  return sourceFile;
}

export function generateEnvironmentIndexDefinition(environments: string[]): SourceFile {
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
    configObject.addShorthandPropertyAssignment({
      name: environmentName,
    });
  }

  return sourceFile;
}

export function generateEnvironmentSettingsFile(
  environmentName: string,
  environmentData: EnvironmentSettingsData
): SourceFile {
  return generateEnvironmentSettingsDefinition(environmentName, environmentData);
}

export function generateEnvironmentIndexFile(environments: string[]): SourceFile {
  return generateEnvironmentIndexDefinition(environments);
}

function needsCredentialStoreType(environmentData: EnvironmentSettingsData): boolean {
  if (!isPlainObject(environmentData.credentials)) {
    return false;
  }

  return Object.values(environmentData.credentials).some(
    (credential) =>
      isPlainObject(credential) &&
      typeof credential.type === 'string' &&
      ['memory', 'env', 'keychain'].includes(credential.type)
  );
}

function addCredentialsProperty(
  configObject: ObjectLiteralExpression,
  credentials: unknown,
  hasCredentialStoreType: boolean
): void {
  if (!isPlainObject(credentials) || !Object.keys(credentials).length) {
    configObject.addPropertyAssignment({
      name: 'credentials',
      initializer: '{}',
    });
    return;
  }

  const credentialsProperty = configObject.addPropertyAssignment({
    name: 'credentials',
    initializer: '{}',
  });
  const credentialsObject = credentialsProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  for (const [credentialKey, credentialValue] of Object.entries(credentials)) {
    if (!isPlainObject(credentialValue)) {
      continue;
    }

    const credentialEntry = credentialsObject.addPropertyAssignment({
      name: formatPropertyName(credentialKey),
      initializer: '{}',
    });
    const credentialObject = credentialEntry.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    writeCredential(
      credentialObject,
      credentialValue as EnvironmentCredentialData,
      hasCredentialStoreType
    );
  }
}

function writeCredential(
  credentialObject: ObjectLiteralExpression,
  credentialData: EnvironmentCredentialData,
  hasCredentialStoreType: boolean
): void {
  if (credentialData.id !== undefined) {
    addStringProperty(credentialObject, 'id', credentialData.id);
  }

  if (credentialData.name !== undefined && credentialData.name !== null) {
    addStringProperty(credentialObject, 'name', credentialData.name);
  }

  if (credentialData.type !== undefined) {
    if (
      hasCredentialStoreType &&
      typeof credentialData.type === 'string' &&
      ['memory', 'env', 'keychain'].includes(credentialData.type)
    ) {
      credentialObject.addPropertyAssignment({
        name: 'type',
        initializer: `CredentialStoreType.${credentialData.type}`,
      });
    } else {
      credentialObject.addPropertyAssignment({
        name: 'type',
        initializer: formatInlineLiteral(credentialData.type),
      });
    }
  }

  if (credentialData.credentialStoreId !== undefined) {
    addStringProperty(credentialObject, 'credentialStoreId', credentialData.credentialStoreId);
  }

  if (credentialData.description !== undefined && credentialData.description !== null) {
    addStringProperty(credentialObject, 'description', credentialData.description);
  }

  addRetrievalParams(credentialObject, credentialData.retrievalParams);
}

function addRetrievalParams(
  credentialObject: ObjectLiteralExpression,
  retrievalParams: unknown
): void {
  if (!isPlainObject(retrievalParams)) {
    return;
  }

  const retrievalParamsProperty = credentialObject.addPropertyAssignment({
    name: 'retrievalParams',
    initializer: '{}',
  });
  const retrievalParamsObject = retrievalParamsProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  for (const [key, value] of Object.entries(retrievalParams)) {
    if (value === undefined || value === null) {
      continue;
    }

    retrievalParamsObject.addPropertyAssignment({
      name: formatPropertyName(key),
      initializer: formatInlineLiteral(value),
    });
  }

  if (!retrievalParamsObject.getProperties().length) {
    retrievalParamsProperty.remove();
  }
}
