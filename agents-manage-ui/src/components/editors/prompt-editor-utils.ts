export function extractInvalidVariables(text: string, suggestions: string[]): string[] {
  const validVariables = new Set(suggestions);
  const matches = text.matchAll(/\{\{([^}]+)}}/g);
  const invalid: string[] = [];

  for (const [, variableName] of matches) {
    const name = variableName.trim();
    const isValid =
      validVariables.has(name) ||
      name.startsWith('$env.') ||
      name.includes('[') ||
      name.startsWith('length(');

    if (!isValid) {
      invalid.push(name);
    }
  }

  return [...new Set(invalid)];
}
