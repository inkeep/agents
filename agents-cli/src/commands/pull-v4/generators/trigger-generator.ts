import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  convertNullToUndefined,
  createFactoryDefinition,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.agents.valueType.shape.triggers
  .unwrap()
  .valueType.omit({
    id: true,
  });

const TriggerSchema = z.strictObject({
  triggerId: z.string().nonempty(),
  ...MySchema.shape,
});

type TriggerInput = z.input<typeof TriggerSchema>;

export function generateTriggerDefinition(data: TriggerInput): SourceFile {
  const result = TriggerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for trigger:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'Trigger',
    variableName: toCamelCase(parsed.triggerId),
    syntaxKind: SyntaxKind.NewExpression,
  });

  const { triggerId, signingSecretCredentialReferenceId, ...rest } = parsed;

  for (const [key, value] of Object.entries({
    id: triggerId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }

  if (signingSecretCredentialReferenceId) {
    const varName = toCamelCase(signingSecretCredentialReferenceId as string);
    sourceFile.addImportDeclaration({
      namedImports: [varName],
      moduleSpecifier: `../../credentials/${signingSecretCredentialReferenceId}`,
    });
    configObject.addPropertyAssignment({
      name: 'signingSecretCredentialReference',
      initializer: varName,
    });
  }

  return sourceFile;
}
