const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{24,}$/;
const NANOID_RE = /^[a-z0-9]{16,}$/;
const ID_SUFFIX_LENGTH = 8;
type ReferenceOverrideMap = Record<string, string>;

export function resolveNonCollidingName(
  baseName: string,
  reservedNames: Set<string>,
  startIndex = 1
): string {
  if (!reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  let index = startIndex;
  while (reservedNames.has(`${baseName}${index}`)) {
    index += 1;
  }

  const uniqueName = `${baseName}${index}`;
  reservedNames.add(uniqueName);
  return uniqueName;
}

export function toCamelCase(input: string): string {
  const result = input
    .toLowerCase()
    .replaceAll(/\W/g, ' ')
    .trim()
    .replaceAll(/[\s_]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^[0-9]/, '_$&');

  return result.charAt(0).toLowerCase() + result.slice(1);
}

export function toToolReferenceName(input: string): string {
  const base = toCamelCase(input);
  return base.endsWith('Tool') ? base : `${base}Tool`;
}

export function toCredentialReferenceName(input: string): string {
  const base = toCamelCase(input);
  return base.endsWith('Credential') ? base : `${base}Credential`;
}

export function toTriggerReferenceName(input: string): string {
  const base = toCamelCase(input);
  return base.endsWith('Trigger') ? base : `${base}Trigger`;
}

export function toKebabCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

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

  return resolveNonCollidingName(baseCandidate, reservedNames, 2);
}

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
