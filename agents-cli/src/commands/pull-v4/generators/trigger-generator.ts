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
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  inputSchema: z.preprocess((v) => v || undefined, MySchema.shape.inputSchema),
  outputTransform: z.preprocess((v) => v || undefined, MySchema.shape.outputTransform),
  messageTemplate: z.preprocess((v) => v || undefined, MySchema.shape.messageTemplate),
  authentication: z.preprocess(
    (v) => v || undefined,
    // ✖ Invalid input: expected string, received undefined
    // → at authentication.headers[0].value
    z.unknown()
  ),
  signatureVerification: z.preprocess((v) => v || undefined, MySchema.shape.signatureVerification),
});

type TriggerInput = z.input<typeof TriggerSchema>;

export function generateTriggerDefinition({
  // @ts-expect-error
  id,
  ...data
}: TriggerInput): SourceFile {
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
