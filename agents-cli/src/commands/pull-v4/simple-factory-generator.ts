import type { ObjectLiteralExpression, SourceFile, SyntaxKind } from 'ts-morph';
import { type input, type output, type ZodType, z } from 'zod';
import { addValueToObject, createFactoryDefinition } from './utils';

interface GeneratorValidationOptions<TSchema extends ZodType> {
  schema: TSchema;
  errorLabel?: string;
  importName?: string;
}

interface FactorySourceFileOptions<TSchema extends ZodType>
  extends Omit<GeneratorValidationOptions<TSchema>, 'errorLabel' | 'importName'> {
  factory: {
    importName: string;
    variableName: (parsed: output<TSchema>) => string;
    fileName?: string;
    moduleSpecifier?: string;
    syntaxKind?: SyntaxKind.CallExpression | SyntaxKind.NewExpression;
  };
  render: (options: {
    parsed: output<TSchema>;
    sourceFile: SourceFile;
    configObject: ObjectLiteralExpression;
  }) => void;
}

interface SimpleFactoryDefinitionOptions<TSchema extends ZodType<Record<string, unknown>>>
  extends Omit<GeneratorValidationOptions<TSchema>, 'errorLabel' | 'importName'> {
  factory: FactorySourceFileOptions<TSchema>['factory'];
  buildConfig?: (parsed: output<TSchema>) => Record<string, unknown>;
  finalize?: (options: {
    parsed: output<TSchema>;
    sourceFile: SourceFile;
    configObject: ObjectLiteralExpression;
  }) => void;
}

export function validateGeneratorInput<TSchema extends ZodType>(
  data: input<TSchema>,
  options: GeneratorValidationOptions<TSchema>
): output<TSchema> {
  const result = options.schema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Validation failed for ${options.errorLabel ?? options.importName}:\n${z.prettifyError(result.error)}`
    );
  }

  return result.data;
}

export function generateValidatedSourceFile<TSchema extends ZodType>(
  data: input<TSchema>,
  options: GeneratorValidationOptions<TSchema> & {
    render: (parsed: output<TSchema>) => SourceFile;
  }
): SourceFile {
  return options.render(validateGeneratorInput(data, options));
}

export function generateFactorySourceFile<TSchema extends ZodType>(
  data: input<TSchema>,
  options: FactorySourceFileOptions<TSchema>
): SourceFile {
  const { importName, fileName, moduleSpecifier, syntaxKind } = options.factory;

  return generateValidatedSourceFile(data, {
    schema: options.schema,
    importName,
    render(parsed) {
      const { sourceFile, configObject } = createFactoryDefinition({
        importName,
        variableName: options.factory.variableName(parsed),
        ...(fileName && { fileName }),
        ...(moduleSpecifier && { moduleSpecifier }),
        ...(syntaxKind && { syntaxKind }),
      });

      options.render({ parsed, sourceFile, configObject });

      return sourceFile;
    },
  });
}

export function generateSimpleFactoryDefinition<TSchema extends ZodType<Record<string, unknown>>>(
  data: input<TSchema>,
  options: SimpleFactoryDefinitionOptions<TSchema>
): SourceFile {
  return generateFactorySourceFile(data, {
    schema: options.schema,
    factory: options.factory,
    render({ parsed, sourceFile, configObject }) {
      const config = options.buildConfig ? options.buildConfig(parsed) : parsed;
      for (const [key, value] of Object.entries(config)) {
        addValueToObject(configObject, key, value);
      }

      options.finalize?.({ parsed, sourceFile, configObject });
    },
  });
}
