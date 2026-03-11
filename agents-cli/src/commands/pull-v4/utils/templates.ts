import { isPlainObject } from './shared';

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

export function formatPropertyName(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key;
  }
  return formatStringLiteral(key);
}

function escapeStringLiteral(value: string, quote: Quote): string {
  return [quote, value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`), quote].join('');
}
