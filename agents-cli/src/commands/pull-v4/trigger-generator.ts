import {
  IndentationText,
  NewLineKind,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { z } from 'zod';
import { addStringProperty, formatStringLiteral, isPlainObject, toCamelCase } from './utils';

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

type ParsedTriggerDefinitionData = z.infer<typeof TriggerSchema>;

export function generateTriggerDefinition(data: TriggerDefinitionData): string {
  const result = TriggerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Missing required fields for trigger:\n${z.prettifyError(result.error)}`);
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: false,
    },
  });

  const parsed = result.data;
  const sourceFile = project.createSourceFile('trigger-definition.ts', '', { overwrite: true });
  sourceFile.addImportDeclaration({
    namedImports: ['Trigger'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const credentialReferenceId = extractCredentialReferenceId(
    parsed.signingSecretCredentialReferenceId,
    parsed.signingSecretCredentialReference
  );
  if (credentialReferenceId) {
    sourceFile.addImportDeclaration({
      namedImports: [toTriggerVariableName(credentialReferenceId)],
      moduleSpecifier: `../../credentials/${credentialReferenceId}`,
    });
  }

  const triggerVarName = toTriggerVariableName(parsed.triggerId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: triggerVarName,
        initializer: 'new Trigger({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create variable declaration for trigger '${parsed.triggerId}'`);
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.NewExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeTriggerConfig(configObject, parsed);

  return sourceFile.getFullText().trimEnd();
}

function writeTriggerConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedTriggerDefinitionData
) {
  addStringProperty(configObject, 'id', data.triggerId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  }

  if (data.enabled !== undefined) {
    configObject.addPropertyAssignment({
      name: 'enabled',
      initializer: data.enabled ? 'true' : 'false',
    });
  }

  addStringProperty(configObject, 'messageTemplate', data.messageTemplate);

  if (data.inputSchema !== undefined) {
    configObject.addPropertyAssignment({
      name: 'inputSchema',
      initializer: formatInlineLiteral(data.inputSchema),
    });
  }

  if (data.outputTransform) {
    addOutputTransformProperty(configObject, data.outputTransform);
  }

  if (data.authentication) {
    addAuthenticationProperty(configObject, data.authentication);
  }

  if (data.signatureVerification) {
    addSignatureVerificationProperty(configObject, data.signatureVerification);
  }

  const credentialReferenceId = extractCredentialReferenceId(
    data.signingSecretCredentialReferenceId,
    data.signingSecretCredentialReference
  );
  if (credentialReferenceId) {
    configObject.addPropertyAssignment({
      name: 'signingSecretCredentialReference',
      initializer: toTriggerVariableName(credentialReferenceId),
    });
  }
}

function addOutputTransformProperty(
  configObject: ObjectLiteralExpression,
  outputTransform: NonNullable<ParsedTriggerDefinitionData['outputTransform']>
) {
  const outputTransformProperty = configObject.addPropertyAssignment({
    name: 'outputTransform',
    initializer: '{}',
  });
  const outputTransformObject = outputTransformProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  if (outputTransform.jmespath !== undefined) {
    addStringProperty(outputTransformObject, 'jmespath', outputTransform.jmespath);
  }

  if (outputTransform.objectTransformation !== undefined) {
    outputTransformObject.addPropertyAssignment({
      name: 'objectTransformation',
      initializer: formatInlineLiteral(outputTransform.objectTransformation),
    });
  }
}

function addAuthenticationProperty(
  configObject: ObjectLiteralExpression,
  authentication: NonNullable<ParsedTriggerDefinitionData['authentication']>
) {
  const validHeaders = (authentication.headers ?? []).filter(
    (header) => isPlainObject(header) && typeof header.name === 'string'
  );
  if (validHeaders.length === 0) {
    return;
  }

  const authenticationProperty = configObject.addPropertyAssignment({
    name: 'authentication',
    initializer: '{}',
  });
  const authenticationObject = authenticationProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );
  const headersProperty = authenticationObject.addPropertyAssignment({
    name: 'headers',
    initializer: '[]',
  });
  const headersArray = headersProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ArrayLiteralExpression
  );

  for (const header of validHeaders) {
    const headerName = String(header.name);
    const headerExpression = headersArray.addElement('{}');
    const headerObject = headerExpression.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    addStringProperty(headerObject, 'name', headerName);
    headerObject.addPropertyAssignment({
      name: 'value',
      initializer: `process.env.${toAuthenticationEnvVar(headerName)} || ''`,
    });

    if (typeof header.valueHash === 'string') {
      addStringProperty(headerObject, 'valueHash', header.valueHash);
    }
    if (typeof header.valuePrefix === 'string') {
      addStringProperty(headerObject, 'valuePrefix', header.valuePrefix);
    }
  }
}

function addSignatureVerificationProperty(
  configObject: ObjectLiteralExpression,
  signatureVerification: NonNullable<ParsedTriggerDefinitionData['signatureVerification']>
) {
  const signatureVerificationProperty = configObject.addPropertyAssignment({
    name: 'signatureVerification',
    initializer: '{}',
  });
  const signatureVerificationObject = signatureVerificationProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  if (signatureVerification.algorithm !== undefined) {
    addStringProperty(signatureVerificationObject, 'algorithm', signatureVerification.algorithm);
  }

  if (signatureVerification.encoding !== undefined) {
    addStringProperty(signatureVerificationObject, 'encoding', signatureVerification.encoding);
  }

  if (isPlainObject(signatureVerification.signature)) {
    const signatureProperty = signatureVerificationObject.addPropertyAssignment({
      name: 'signature',
      initializer: '{}',
    });
    const signatureObject = signatureProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );

    if (typeof signatureVerification.signature.source === 'string') {
      addStringProperty(signatureObject, 'source', signatureVerification.signature.source);
    }
    if (typeof signatureVerification.signature.key === 'string') {
      addStringProperty(signatureObject, 'key', signatureVerification.signature.key);
    }
    if (typeof signatureVerification.signature.prefix === 'string') {
      addStringProperty(signatureObject, 'prefix', signatureVerification.signature.prefix);
    }
    if (typeof signatureVerification.signature.regex === 'string') {
      addStringProperty(signatureObject, 'regex', signatureVerification.signature.regex);
    }
  }

  const signedComponents = (signatureVerification.signedComponents ?? []).filter(isPlainObject);
  if (signedComponents.length > 0) {
    const signedComponentsProperty = signatureVerificationObject.addPropertyAssignment({
      name: 'signedComponents',
      initializer: '[]',
    });
    const signedComponentsArray = signedComponentsProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ArrayLiteralExpression
    );

    for (const component of signedComponents) {
      const componentExpression = signedComponentsArray.addElement('{}');
      const componentObject = componentExpression.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

      if (typeof component.source === 'string') {
        addStringProperty(componentObject, 'source', component.source);
      }
      if (typeof component.key === 'string') {
        addStringProperty(componentObject, 'key', component.key);
      }
      if (typeof component.value === 'string') {
        addStringProperty(componentObject, 'value', component.value);
      }
      if (typeof component.regex === 'string') {
        addStringProperty(componentObject, 'regex', component.regex);
      }
      if (typeof component.required === 'boolean') {
        componentObject.addPropertyAssignment({
          name: 'required',
          initializer: component.required ? 'true' : 'false',
        });
      }
    }
  }

  if (isPlainObject(signatureVerification.componentJoin)) {
    const componentJoinProperty = signatureVerificationObject.addPropertyAssignment({
      name: 'componentJoin',
      initializer: '{}',
    });
    const componentJoinObject = componentJoinProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );

    if (typeof signatureVerification.componentJoin.strategy === 'string') {
      addStringProperty(
        componentJoinObject,
        'strategy',
        signatureVerification.componentJoin.strategy
      );
    }
    if (typeof signatureVerification.componentJoin.separator === 'string') {
      addStringProperty(
        componentJoinObject,
        'separator',
        signatureVerification.componentJoin.separator
      );
    }
  }

  if (isPlainObject(signatureVerification.validation)) {
    const validationEntries = Object.entries(signatureVerification.validation).filter(
      ([, value]) => typeof value === 'boolean'
    );
    if (validationEntries.length > 0) {
      const validationProperty = signatureVerificationObject.addPropertyAssignment({
        name: 'validation',
        initializer: '{}',
      });
      const validationObject = validationProperty.getInitializerIfKindOrThrow(
        SyntaxKind.ObjectLiteralExpression
      );
      for (const [key, value] of validationEntries) {
        validationObject.addPropertyAssignment({
          name: key,
          initializer: value ? 'true' : 'false',
        });
      }
    }
  }
}

function extractCredentialReferenceId(
  signingSecretCredentialReferenceId?: string,
  signingSecretCredentialReference?: string | { id?: string }
): string | undefined {
  if (signingSecretCredentialReferenceId) {
    return signingSecretCredentialReferenceId;
  }
  if (typeof signingSecretCredentialReference === 'string') {
    return signingSecretCredentialReference;
  }
  if (
    isPlainObject(signingSecretCredentialReference) &&
    typeof signingSecretCredentialReference.id === 'string'
  ) {
    return signingSecretCredentialReference.id;
  }
  return undefined;
}

function toAuthenticationEnvVar(headerName: string): string {
  const normalized = headerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (!normalized) {
    return 'TRIGGER_AUTH_HEADER';
  }
  return `TRIGGER_AUTH_${normalized}`;
}

function toTriggerVariableName(value: string): string {
  const variableName = toCamelCase(value);
  if (!variableName) {
    return 'triggerDefinition';
  }
  return variableName;
}

function formatPropertyName(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key;
  }
  return formatStringLiteral(key);
}

function formatInlineLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return formatStringLiteral(value);
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatInlineLiteral(item)).join(', ')}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
    if (entries.length === 0) {
      return '{}';
    }
    return `{ ${entries
      .map(([key, entryValue]) => `${formatPropertyName(key)}: ${formatInlineLiteral(entryValue)}`)
      .join(', ')} }`;
  }
  return 'undefined';
}
