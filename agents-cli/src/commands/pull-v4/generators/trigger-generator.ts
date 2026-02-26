import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  convertNullToUndefined,
  createFactoryDefinition,
  toCamelCase,
} from '../utils';

type TriggerDefinitionData = {
  triggerId: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  messageTemplate?: string | null;
  inputSchema?: unknown;
  outputTransform?: {
    jmespath?: string;
    objectTransformation?: unknown;
  } | null;
  authentication?: {
    headers?: Array<{
      name?: string;
      valueHash?: string;
      valuePrefix?: string;
      value?: string;
    }>;
  } | null;
  signatureVerification?: {
    algorithm?: string;
    encoding?: string;
    signature?: {
      source?: string;
      key?: string;
      prefix?: string;
      regex?: string;
    };
    signedComponents?: Array<{
      source?: string;
      key?: string;
      value?: string;
      regex?: string;
      required?: boolean;
    }>;
    componentJoin?: {
      strategy?: string;
      separator?: string;
    };
    validation?: {
      headerCaseSensitive?: boolean;
      allowEmptyBody?: boolean;
      normalizeUnicode?: boolean;
    };
  } | null;
  signingSecretCredentialReferenceId?: string | null;
  signingSecretCredentialReference?: string | { id?: string } | null;
};

const TriggerSchema = z.looseObject({
  triggerId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().nullable().optional().transform(convertNullToUndefined),
  enabled: z.boolean().optional(),
  messageTemplate: z.string().nullable().optional().transform(convertNullToUndefined),
  inputSchema: z.unknown().optional(),
  outputTransform: z
    .looseObject({
      jmespath: z.string().optional(),
      objectTransformation: z.unknown().optional(),
    })
    .nullable()
    .optional()
    .transform(convertNullToUndefined),
  authentication: z
    .looseObject({
      headers: z.array(z.looseObject({})).optional(),
    })
    .nullable()
    .optional()
    .transform(convertNullToUndefined),
  signatureVerification: z
    .looseObject({
      algorithm: z.string().optional(),
      encoding: z.string().optional(),
      signature: z.looseObject({}).optional(),
      signedComponents: z.array(z.looseObject({})).optional(),
      componentJoin: z.looseObject({}).optional(),
      validation: z.looseObject({}).optional(),
    })
    .nullable()
    .optional()
    .transform(convertNullToUndefined),
  signingSecretCredentialReferenceId: z
    .string()
    .nullable()
    .optional()
    .transform(convertNullToUndefined),
  signingSecretCredentialReference: z
    .union([z.string(), z.looseObject({ id: z.string().optional() })])
    .nullable()
    .optional()
    .transform(convertNullToUndefined),
});

export function generateTriggerDefinition(data: TriggerDefinitionData): SourceFile {
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
