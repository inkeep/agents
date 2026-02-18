import { SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createInMemoryProject, toCamelCase } from './utils';

type TriggerDefinitionData = {
  triggerId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  messageTemplate: string;
  inputSchema?: unknown;
  outputTransform?: {
    jmespath?: string;
    objectTransformation?: unknown;
  };
  authentication?: {
    headers?: Array<{
      name?: string;
      valueHash?: string;
      valuePrefix?: string;
      value?: string;
    }>;
  };
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
  };
  signingSecretCredentialReferenceId?: string;
  signingSecretCredentialReference?: string | { id?: string };
};

const TriggerSchema = z.looseObject({
  triggerId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  messageTemplate: z.string().nonempty(),
  inputSchema: z.unknown().optional(),
  outputTransform: z
    .looseObject({
      jmespath: z.string().optional(),
      objectTransformation: z.unknown().optional(),
    })
    .optional(),
  authentication: z
    .looseObject({
      headers: z.array(z.looseObject({})).optional(),
    })
    .optional(),
  signatureVerification: z
    .looseObject({
      algorithm: z.string().optional(),
      encoding: z.string().optional(),
      signature: z.looseObject({}).optional(),
      signedComponents: z.array(z.looseObject({})).optional(),
      componentJoin: z.looseObject({}).optional(),
      validation: z.looseObject({}).optional(),
    })
    .optional(),
  signingSecretCredentialReferenceId: z.string().optional(),
  signingSecretCredentialReference: z
    .union([z.string(), z.looseObject({ id: z.string().optional() })])
    .optional(),
});

export function generateTriggerDefinition(data: TriggerDefinitionData): string {
  const result = TriggerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for trigger:\n${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();

  const parsed = result.data;
  const sourceFile = project.createSourceFile('trigger-definition.ts', '', { overwrite: true });
  const importName = 'Trigger';
  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{ name: toCamelCase(parsed.triggerId), initializer: `new ${importName}({})` }],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create variable declaration for trigger '${parsed.triggerId}'`);
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.NewExpression);
  const configObject = callExpression
    .getArguments()[0]
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const { triggerId, signingSecretCredentialReferenceId, ...rest } = parsed;

  for (const [key, value] of Object.entries({
    id: triggerId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }

  if (signingSecretCredentialReferenceId) {
    const varName = toCamelCase(signingSecretCredentialReferenceId);
    sourceFile.addImportDeclaration({
      namedImports: [varName],
      moduleSpecifier: `../../credentials/${signingSecretCredentialReferenceId}`,
    });
    configObject.addPropertyAssignment({
      name: 'signingSecretCredentialReference',
      initializer: varName,
    });
  }

  return sourceFile.getFullText();
}
