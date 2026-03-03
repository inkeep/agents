const DEFAULT_IGNORED_FIELDS = new Set([
  'tenantId',
  'id',
  'projectId',
  'agentId',
  'createdAt',
  'updatedAt',
]);

export function isEntityChanged(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  ignoredFields: Set<string> = DEFAULT_IGNORED_FIELDS
): boolean {
  for (const key of Object.keys(existing)) {
    if (ignoredFields.has(key)) continue;
    if (!(key in incoming)) continue;

    const incomingVal = incoming[key] ?? null;
    const existingVal = existing[key] ?? null;

    if (typeof incomingVal === 'object' || typeof existingVal === 'object') {
      if (JSON.stringify(incomingVal) !== JSON.stringify(existingVal)) return true;
    } else if (incomingVal !== existingVal) {
      return true;
    }
  }
  return false;
}
