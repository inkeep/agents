import { and, eq, type SQL } from 'drizzle-orm';
import {
  SCOPE_KEYS,
  type ScopeConfig,
  type ScopedTable,
  type ScopeLevel,
} from '../../db/manage/scope-definitions';

/**
 * Build a WHERE clause that filters by all scope columns for the given level.
 *
 * The columns and config shape are both derived from `SCOPE_KEYS` in
 * `scope-definitions.ts`, so they cannot drift apart.
 */
export function scopedWhere<L extends ScopeLevel>(
  level: L,
  table: ScopedTable<L>,
  scopes: ScopeConfig<L>
): SQL | undefined {
  const keys = SCOPE_KEYS[level];
  const conditions = keys.map((key) =>
    eq((table as Record<string, any>)[key], (scopes as Record<string, string>)[key])
  );
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

// Named wrappers for ergonomics and grep-ability.
export const tenantScopedWhere = <T extends ScopedTable<'tenant'>>(
  table: T,
  scopes: ScopeConfig<'tenant'>
) => scopedWhere('tenant', table, scopes);

export const projectScopedWhere = <T extends ScopedTable<'project'>>(
  table: T,
  scopes: ScopeConfig<'project'>
) => scopedWhere('project', table, scopes);

export const agentScopedWhere = <T extends ScopedTable<'agent'>>(
  table: T,
  scopes: ScopeConfig<'agent'>
) => scopedWhere('agent', table, scopes);

export const subAgentScopedWhere = <T extends ScopedTable<'subAgent'>>(
  table: T,
  scopes: ScopeConfig<'subAgent'>
) => scopedWhere('subAgent', table, scopes);
