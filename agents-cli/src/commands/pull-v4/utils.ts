import path from 'node:path';
import { jsonSchemaToZod } from 'json-schema-to-zod';
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

export function createInMemoryProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    // we don't need them, this improves performance and makes tests fast
    skipLoadingLibFiles: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: true,
    },
  });
}

interface CreateFactoryDefinitionOptions
  extends Pick<AddFactoryConfigVariableOptions, 'syntaxKind' | 'importName' | 'variableName'> {
  /** @default "definition.ts" */
  fileName?: string;
  /** @default "@inkeep/agents-sdk" */
  moduleSpecifier?: string;
}

interface AddFactoryConfigVariableOptions {
  sourceFile: SourceFile;
  importName: string;
  variableName: string;
  isExported?: boolean;
  /** @default SyntaxKind.CallExpression */
  syntaxKind?: SyntaxKind.CallExpression | SyntaxKind.NewExpression;
}

/**
 * Create variable in following pattern
 *
 * (export)? const VARIABLE_NAME = (new)?IMPORT_NAME({})
 */
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
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName,
    variableName: name,
    isExported: true,
    syntaxKind,
  });

  return {
    sourceFile,
    configObject,
  };
}

export function toCamelCase(input: string): string {
  const result = input
    .replace(/[^a-zA-Z0-9](.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^[0-9]/, '_$&');

  return result.charAt(0).toLowerCase() + result.slice(1);
}

export function toKebabCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{24,}$/;
const NANOID_RE = /^[a-z0-9]{16,}$/;

export function isHumanReadableId(id: string): boolean {
  if (UUID_RE.test(id) || CUID_RE.test(id) || NANOID_RE.test(id)) {
    return false;
  }

  const segments = id.split(/[-_]/);
  if (segments.length === 1 && id.length > 8) {
    const hasLetters = /[a-zA-Z]/.test(id);
    const hasDigits = /[0-9]/.test(id);
    if (hasLetters && hasDigits) {
      return false;
    }
  }

  const wordLikeSegments = segments.filter((s) => /^[a-zA-Z]+\d{0,2}$/.test(s));
  return wordLikeSegments.length / segments.length >= 0.5;
}

const ID_SUFFIX_LENGTH = 8;

export function buildComponentFileName(id: string, name?: string): string {
  if (!name || isHumanReadableId(id)) {
    return `${id}.ts`;
  }

  const kebabName = toKebabCase(name);
  if (!kebabName || kebabName === id) {
    return `${id}.ts`;
  }

  const shortId = id.slice(-ID_SUFFIX_LENGTH);
  return `${kebabName}-${shortId}.ts`;
}

export function createUniqueReferenceName(
  baseName: string,
  reservedNames: Set<string>,
  conflictSuffix: string
): string {
  if (!reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  const baseCandidate = `${baseName}${conflictSuffix}`;
  if (!reservedNames.has(baseCandidate)) {
    reservedNames.add(baseCandidate);
    return baseCandidate;
  }

  let index = 2;
  while (reservedNames.has(`${baseCandidate}${index}`)) {
    index += 1;
  }

  const uniqueName = `${baseCandidate}${index}`;
  reservedNames.add(uniqueName);
  return uniqueName;
}

type ReferenceOverrideMap = Record<string, string>;

export function resolveReferenceName(
  referenceId: string,
  referenceOverrides: Array<ReferenceOverrideMap | undefined>
): string {
  for (const overrideMap of referenceOverrides) {
    const overrideName = overrideMap?.[referenceId];
    if (overrideName) {
      return overrideName;
    }
  }

  return toCamelCase(referenceId);
}

export function convertJsonSchemaToZodSafe(
  schema: unknown,
  options?: { conversionOptions?: Parameters<typeof jsonSchemaToZod>[1] }
): string {
  if (!isPlainObject(schema)) {
    console.warn('Schema conversion skipped: non-object schema provided, using z.any()');
    return 'z.any()';
  }
  try {
    return jsonSchemaToZod(schema, options?.conversionOptions);
  } catch (error) {
    console.warn(
      `Schema conversion failed: ${error instanceof Error ? error.message : String(error)}. Falling back to z.any()`
    );
    return 'z.any()';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const QUOTE = Object.freeze({
  single: "'",
  double: '"',
  template: '`',
});

type Quote = (typeof QUOTE)[keyof typeof QUOTE];

export const TEMPLATE_VARIABLE_REGEX = /\{\{(?!\{)(?<variableName>[^{}]+)}}/g;

interface TemplateReplacementReferences {
  contextReference?: string;
  headersReference?: string;
}

export function formatStringLiteral(value: string): string {
  const hasSingleQuote = value.includes(QUOTE.single);
  const hasDoubleQuote = value.includes(QUOTE.double);
  const quote =
    value.includes('\n') || value.includes('${') || (hasSingleQuote && hasDoubleQuote)
      ? QUOTE.template
      : hasSingleQuote
        ? QUOTE.double
        : QUOTE.single;
  return escapeStringLiteral(value, quote);
}

export function collectTemplateVariableNames(value: string): string[] {
  const variables: string[] = [];
  for (const match of value.matchAll(TEMPLATE_VARIABLE_REGEX)) {
    const variableName = match.groups?.variableName?.trim();
    if (variableName) {
      variables.push(variableName);
    }
  }
  return variables;
}

export function formatTemplate(value: string, references: TemplateReplacementReferences): string {
  if (!value.length) {
    return value;
  }

  let didReplace = false;
  const rewrittenValue = value.replace(
    TEMPLATE_VARIABLE_REGEX,
    (match: string, ...args: unknown[]): string => {
      const maybeGroups = args.at(-1);
      const variableName =
        isPlainObject(maybeGroups) && typeof maybeGroups.variableName === 'string'
          ? maybeGroups.variableName.trim()
          : undefined;

      if (!variableName) {
        return match;
      }

      if (variableName.startsWith('headers.')) {
        const headerPath = variableName.slice('headers.'.length);
        if (!headerPath || !references.headersReference) {
          return match;
        }
        didReplace = true;
        return `\${${references.headersReference}.toTemplate(${JSON.stringify(headerPath)})}`;
      }

      if (!references.contextReference) {
        return match;
      }

      didReplace = true;
      return `\${${references.contextReference}.toTemplate(${JSON.stringify(variableName)})}`;
    }
  );

  return didReplace ? rewrittenValue : value;
}

function escapeStringLiteral(value: string, quote: Quote): string {
  return [
    quote, //
    value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`),
    quote,
  ].join('');
}

export function formatPropertyName(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key;
  }
  return formatStringLiteral(key);
}

export function formatInlineLiteral(value: unknown): string {
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
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatInlineLiteral(item)).join(', ')}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
    if (!entries.length) {
      return '{}';
    }
    return `{ ${entries
      .map(([key, entryValue]) => `${formatPropertyName(key)}: ${formatInlineLiteral(entryValue)}`)
      .join(', ')} }`;
  }
  return 'undefined';
}

export function addReferenceGetterProperty(
  configObject: ObjectLiteralExpression,
  key: string,
  refs: string[]
): void {
  const property = configObject.addPropertyAssignment({
    name: key,
    initializer: '() => []',
  });
  const getter = property.getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);
  const body = getter.getBody().asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  body.addElements(refs);
}

export function addObjectEntries(
  target: ObjectLiteralExpression,
  value: Record<string, unknown>
): void {
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === undefined) {
      continue;
    }

    if (isPlainObject(entryValue)) {
      const property = target.addPropertyAssignment({
        name: formatPropertyName(key),
        initializer: '{}',
      });
      const nestedObject = property.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      addObjectEntries(nestedObject, entryValue);
      continue;
    }

    target.addPropertyAssignment({
      name: formatPropertyName(key),
      initializer: formatInlineLiteral(entryValue),
    });
  }
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
  if (value === undefined) return;

  if (isPlainObject(value)) {
    const p = obj.addPropertyAssignment({ name: formatPropertyName(key), initializer: '{}' });
    const child = p.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const [k, v] of Object.entries(value)) addValueToObject(child, k, v);
    return;
  }

  if (Array.isArray(value)) {
    const p = obj.addPropertyAssignment({ name: formatPropertyName(key), initializer: '[]' });
    const arr = p.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    for (const item of value) {
      addValueToArray(arr, item);
    }
    return;
  }

  obj.addPropertyAssignment({
    name: formatPropertyName(key),
    initializer: formatInlineLiteral(value),
  });
}

function addValueToArray(arr: ArrayLiteralExpression, value: unknown) {
  if (isPlainObject(value)) {
    const expr = arr.addElement('{}');
    const child = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const [k, v] of Object.entries(value)) {
      addValueToObject(child, k, v);
    }
    return;
  }

  if (Array.isArray(value)) {
    const expr = arr.addElement('[]');
    const child = expr.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    for (const item of value) {
      addValueToArray(child, item);
    }
    return;
  }

  arr.addElement(formatInlineLiteral(value));
}

export async function expectSnapshots(definitionV4: string): Promise<void> {
  const { currentTestName, snapshotState } = expect.getState();

  const snapshotDir = path.basename(snapshotState.testFilePath).replace('-generator.test.ts', '');
  await expect(definitionV4).toMatchFileSnapshot(
    `__snapshots__/${snapshotDir}/${currentTestName}-v4.txt`
  );
}

export function convertNullToUndefined(v: unknown) {
  return v == null ? undefined : v;
}

export function hasReferences<T>(references?: T[]): references is T[] {
  return Array.isArray(references) && references.length > 0;
}
