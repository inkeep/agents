import { isPlainObject } from './shared';
import { formatPropertyName, formatStringLiteral } from './templates';

interface CodeReferenceValue {
  kind: 'reference';
  name: string;
}

interface CodeExpressionValue {
  kind: 'expression';
  code: string;
}

export type CodeValue = CodeReferenceValue | CodeExpressionValue;

export function codeReference(name: string): CodeReferenceValue {
  return {
    kind: 'reference',
    name,
  };
}

export function codeExpression(code: string): CodeExpressionValue {
  return {
    kind: 'expression',
    code,
  };
}

export function isCodeValue(value: unknown): value is CodeValue {
  return isCodeReferenceValue(value) || isCodeExpressionValue(value);
}

export function codePropertyAccess(
  target: string | CodeValue,
  property: string
): CodeExpressionValue {
  return codeExpression(`${toCodeSource(target)}.${property}`);
}

export function codeCall(callee: string | CodeValue, ...args: unknown[]): CodeExpressionValue {
  return codeExpression(
    `${toCodeSource(callee)}(${args.map((arg) => formatInlineLiteral(arg)).join(', ')})`
  );
}

export function codeMethodCall(
  target: string | CodeValue,
  method: string,
  ...args: unknown[]
): CodeExpressionValue {
  return codeExpression(
    `${toCodeSource(target)}.${method}(${args.map((arg) => formatInlineLiteral(arg)).join(', ')})`
  );
}

export function createArrayGetterValue(values: unknown[]): CodeExpressionValue {
  return codeExpression(`() => [${values.map((value) => formatInlineLiteral(value)).join(', ')}]`);
}

export function createReferenceGetterValue(
  references: Array<string | CodeValue>
): CodeExpressionValue {
  return createArrayGetterValue(
    references.map((reference) =>
      typeof reference === 'string' ? codeReference(reference) : reference
    )
  );
}

export function formatInlineLiteral(value: unknown): string {
  if (isCodeReferenceValue(value)) {
    return value.name;
  }
  if (isCodeExpressionValue(value)) {
    return value.code;
  }
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

function isCodeReferenceValue(value: unknown): value is CodeReferenceValue {
  return isPlainObject(value) && value.kind === 'reference' && typeof value.name === 'string';
}

function isCodeExpressionValue(value: unknown): value is CodeExpressionValue {
  return isPlainObject(value) && value.kind === 'expression' && typeof value.code === 'string';
}

function toCodeSource(value: string | CodeValue): string {
  if (typeof value === 'string') {
    return value;
  }

  if (isCodeReferenceValue(value)) {
    return value.name;
  }

  return value.code;
}
