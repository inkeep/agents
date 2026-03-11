import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  createFactoryDefinition,
  toCamelCase,
  toTriggerReferenceName,
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
  signingSecretCredentialReferenceName: z.string().nonempty().optional(),
  signingSecretCredentialReferencePath: z.string().nonempty().optional(),
});

type TriggerInput = z.input<typeof TriggerSchema>;

export function generateTriggerDefinition({
  id,
  runAsUserId,
  createdBy,
  ...data
}: TriggerInput & Record<string, unknown>): SourceFile {
  const result = TriggerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for trigger:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'Trigger',
    variableName: toTriggerReferenceName(parsed.name),
    syntaxKind: SyntaxKind.NewExpression,
  });

  const {
    triggerId,
    signingSecretCredentialReferenceId,
    signingSecretCredentialReferenceName,
    signingSecretCredentialReferencePath,
    ...rest
  } = parsed;

  for (const [key, value] of Object.entries({
    id: triggerId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }

  if (signingSecretCredentialReferenceId) {
    const varName =
      signingSecretCredentialReferenceName ??
      toCamelCase(signingSecretCredentialReferenceId as string);
    const modulePath =
      signingSecretCredentialReferencePath ?? (signingSecretCredentialReferenceId as string);
    sourceFile.addImportDeclaration({
      namedImports: [varName],
      moduleSpecifier: `../../credentials/${modulePath}`,
    });
    configObject.addPropertyAssignment({
      name: 'signingSecretCredentialReference',
      initializer: varName,
    });
  }

  return sourceFile;
}
