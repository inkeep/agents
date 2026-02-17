import { jsonSchemaToZod } from 'json-schema-to-zod';
import {
  IndentationText,
  NewLineKind,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  SyntaxKind,
} from 'ts-morph';

export function createInMemoryProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: false,
    },
  });
}

export function toCamelCase(input: string): string {
  const result = input
    .replace(/[-_](.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');

  return result.charAt(0).toLowerCase() + result.slice(1);
}

export function convertJsonSchemaToZodSafe(
  schema: unknown,
  options?: {
    conversionOptions?: Parameters<typeof jsonSchemaToZod>[1];
  }
): string {
  if (!isPlainObject(schema)) {
    return 'z.any()';
  }

  try {
    return jsonSchemaToZod(schema, options?.conversionOptions);
  } catch {
    return 'z.any()';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeTemplateLiteral(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}

export function formatStringLiteral(value: string): string {
  if (value.includes('\n')) {
    return `\`${escapeTemplateLiteral(value)}\``;
  }
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
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
    if (entries.length === 0) {
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
