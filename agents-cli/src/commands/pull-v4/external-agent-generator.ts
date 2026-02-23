import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import { addStringProperty, createFactoryDefinition, toCamelCase } from './utils';

interface ExternalAgentDefinitionData {
  externalAgentId: string;
  name: string;
  description?: string | null;
  baseUrl: string;
  credentialReference?:
    | string
    | {
        id?: string;
        name?: string;
        description?: string;
      };
}

const ExternalAgentSchema = z.looseObject({
  externalAgentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().nullable().optional(),
  baseUrl: z.string().nonempty(),
  credentialReference: z
    .union([
      z.string(),
      z.looseObject({
        id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
      }),
    ])
    .optional(),
});

type ParsedExternalAgentDefinitionData = z.infer<typeof ExternalAgentSchema>;

export function generateExternalAgentDefinition(data: ExternalAgentDefinitionData): SourceFile {
  const result = ExternalAgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for external agent:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'externalAgent',
    variableName: toCamelCase(parsed.externalAgentId),
  });

  if (typeof parsed.credentialReference === 'string') {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(parsed.credentialReference)],
      moduleSpecifier: `../credentials/${parsed.credentialReference}`,
    });
  }

  writeExternalAgentConfig(configObject, parsed);
  return sourceFile;
}

function writeExternalAgentConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedExternalAgentDefinitionData
): void {
  addStringProperty(configObject, 'id', data.externalAgentId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== null && data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  } else {
    addStringProperty(configObject, 'description', `External agent ${data.externalAgentId}`);
  }

  addStringProperty(configObject, 'baseUrl', data.baseUrl);

  if (typeof data.credentialReference === 'string') {
    configObject.addPropertyAssignment({
      name: 'credentialReference',
      initializer: toCamelCase(data.credentialReference),
    });
    return;
  }

  if (!data.credentialReference) {
    return;
  }

  const credentialReferenceProperty = configObject.addPropertyAssignment({
    name: 'credentialReference',
    initializer: '{}',
  });
  const credentialReferenceObject = credentialReferenceProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  if (data.credentialReference.id !== undefined) {
    addStringProperty(credentialReferenceObject, 'id', data.credentialReference.id);
  }

  if (data.credentialReference.name !== undefined) {
    addStringProperty(credentialReferenceObject, 'name', data.credentialReference.name);
  }

  if (data.credentialReference.description !== undefined) {
    addStringProperty(
      credentialReferenceObject,
      'description',
      data.credentialReference.description
    );
  }
}
