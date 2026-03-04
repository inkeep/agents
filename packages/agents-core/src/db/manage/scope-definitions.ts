/**
 * Single source of truth for hierarchical scope column definitions.
 *
 * Everything else — TypeScript config types, WHERE clause helpers, and
 * compile-time table constraints — is derived from these key arrays.
 *
 * The schema column helpers (tenantScoped, projectScoped, etc.) in
 * manage-schema.ts define the Drizzle columns using the same key names.
 * If a key is added or removed here, the schema columns and all
 * downstream consumers (types, query helpers) must be updated together —
 * but now they'll fail at compile time instead of silently drifting.
 */
export const SCOPE_KEYS = {
  tenant: ['tenantId'] as const,
  project: ['tenantId', 'projectId'] as const,
  agent: ['tenantId', 'projectId', 'agentId'] as const,
  subAgent: ['tenantId', 'projectId', 'agentId', 'subAgentId'] as const,
} as const;

export type ScopeLevel = keyof typeof SCOPE_KEYS;

export type ScopeKeysOf<L extends ScopeLevel> = (typeof SCOPE_KEYS)[L][number];

/** A table that has the columns required for a given scope level. */
export type ScopedTable<L extends ScopeLevel> = {
  [K in ScopeKeysOf<L>]: any;
};

/** The parameter object shape required to filter by a given scope level. */
export type ScopeConfig<L extends ScopeLevel> = {
  [K in ScopeKeysOf<L>]: string;
};

// Named type aliases for convenience and backwards compatibility.
export type TenantScopeConfig = ScopeConfig<'tenant'>;
export type ProjectScopeConfig = ScopeConfig<'project'>;
export type AgentScopeConfig = ScopeConfig<'agent'>;
export type SubAgentScopeConfig = ScopeConfig<'subAgent'>;
