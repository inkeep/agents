export function toCamelCase(input: string): string {
  const result = input
    .replace(/[-_](.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');

  return result.charAt(0).toLowerCase() + result.slice(1);
}
