export type EntitlementMeta = {
  resourceType: string;
  description: string;
};

const entitlementMeta = new WeakMap<object, EntitlementMeta>();

export function getEntitlementMeta(mw: unknown): EntitlementMeta | undefined {
  return typeof mw === 'function' ? entitlementMeta.get(mw as object) : undefined;
}

export function registerEntitlementMeta(mw: object, meta: EntitlementMeta): void {
  entitlementMeta.set(mw, meta);
}
