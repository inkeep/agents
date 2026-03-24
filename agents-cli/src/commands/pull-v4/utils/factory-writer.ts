import {
  type ArrayLiteralExpression,
  IndentationText,
  NewLineKind,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { formatInlineLiteral, isCodeValue } from './code-values';
import { resolveNonCollidingName } from './naming';
import { isPlainObject } from './shared';
import { formatPropertyName, formatStringLiteral } from './templates';

interface CreateFactoryDefinitionOptions
  extends Pick<AddFactoryConfigVariableOptions, 'syntaxKind' | 'importName' | 'variableName'> {
  fileName?: string;
  moduleSpecifier?: string;
}

interface AddFactoryConfigVariableOptions {
  sourceFile: SourceFile;
  importName: string;
  variableName: string;
  isExported?: boolean;
  syntaxKind?: SyntaxKind.CallExpression | SyntaxKind.NewExpression;
}

export function createInMemoryProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: true,
    },
  });
}

export function addFactoryConfigVariable({
  sourceFile,
  importName,
  variableName,
  isExported,
  syntaxKind = SyntaxKind.CallExpression,
}: AddFactoryConfigVariableOptions): {
  configObject: ObjectLiteralExpression;
} {
  const initializer = `${syntaxKind === SyntaxKind.NewExpression ? 'new ' : ''}${importName}({})`;
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported,
    declarations: [{ name: variableName, initializer }],
  });
  const [declaration] = variableStatement.getDeclarations();
  const invocation = declaration.getInitializerIfKindOrThrow(syntaxKind);
  const [configArg] = invocation.getArguments();

  return {
    configObject: configArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
  };
}

export function createFactoryDefinition({
  importName,
  variableName: name,
  fileName = 'definition.ts',
  moduleSpecifier = '@inkeep/agents-sdk',
  syntaxKind,
}: CreateFactoryDefinitionOptions): {
  sourceFile: SourceFile;
  configObject: ObjectLiteralExpression;
} {
  const sourceFile = createInMemoryProject().createSourceFile(fileName, '', {
    overwrite: true,
  });
  sourceFile.addImportDeclaration({ namedImports: [importName], moduleSpecifier });
  const localVariableName = resolveNonCollidingName(name, collectTakenNames(sourceFile));
  const shouldAliasExport = localVariableName !== name;
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName,
    variableName: localVariableName,
    isExported: !shouldAliasExport,
    syntaxKind,
  });
  if (shouldAliasExport) {
    sourceFile.addExportDeclaration({
      namedExports: [{ name: localVariableName, alias: name }],
    });
  }

  return {
    sourceFile,
    configObject,
  };
}

export function addStringProperty(
  configObject: ObjectLiteralExpression,
  key: string,
  value: string
): void {
  configObject.addPropertyAssignment({
    name: key,
    initializer: formatStringLiteral(value),
  });
}

export function addValueToObject(obj: ObjectLiteralExpression, key: string, value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (isCodeValue(value)) {
    obj.addPropertyAssignment({
      name: formatPropertyName(key),
      initializer: formatInlineLiteral(value),
    });
    return;
  }

  if (isPlainObject(value)) {
    const property = obj.addPropertyAssignment({
      name: formatPropertyName(key),
      initializer: '{}',
    });
    const child = property.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const [childKey, childValue] of Object.entries(value)) {
      addValueToObject(child, childKey, childValue);
    }
    return;
  }

  if (Array.isArray(value)) {
    const property = obj.addPropertyAssignment({
      name: formatPropertyName(key),
      initializer: '[]',
    });
    const arrayLiteral = property.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    for (const item of value) {
      addValueToArray(arrayLiteral, item);
    }
    return;
  }

  obj.addPropertyAssignment({
    name: formatPropertyName(key),
    initializer: formatInlineLiteral(value),
  });
}

function collectTakenNames(sourceFile: SourceFile): Set<string> {
  const takenNames = new Set<string>();

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const defaultImport = importDeclaration.getDefaultImport()?.getText();
    if (defaultImport) {
      takenNames.add(defaultImport);
    }

    const namespaceImport = importDeclaration.getNamespaceImport()?.getText();
    if (namespaceImport) {
      takenNames.add(namespaceImport);
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      takenNames.add(localName);
    }
  }

  for (const variableDeclaration of sourceFile.getVariableDeclarations()) {
    takenNames.add(variableDeclaration.getName());
  }

  return takenNames;
}

function addValueToArray(arr: ArrayLiteralExpression, value: unknown): void {
  if (isCodeValue(value)) {
    arr.addElement(formatInlineLiteral(value));
    return;
  }

  if (isPlainObject(value)) {
    const expression = arr.addElement('{}');
    const child = expression.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const [key, childValue] of Object.entries(value)) {
      addValueToObject(child, key, childValue);
    }
    return;
  }

  if (Array.isArray(value)) {
    const expression = arr.addElement('[]');
    const child = expression.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    for (const item of value) {
      addValueToArray(child, item);
    }
    return;
  }

  arr.addElement(formatInlineLiteral(value));
}
