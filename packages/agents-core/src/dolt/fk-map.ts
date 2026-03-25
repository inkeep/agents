import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../db/manage/manage-schema';

export type FkDeps = Record<string, string[]>;

function buildFkDepsFromSchema(): FkDeps {
  const deps: FkDeps = {};

  for (const value of Object.values(schema)) {
    if (value == null || typeof value !== 'object') continue;

    let config: ReturnType<typeof getTableConfig>;
    try {
      config = getTableConfig(value as any);
    } catch {
      continue;
    }

    if (!config?.name) continue;

    const tableDeps = new Set<string>();
    for (const fk of config.foreignKeys ?? []) {
      const ref = fk.reference();
      let refName: string | undefined;
      try {
        refName = getTableConfig(ref.foreignTable as any).name;
      } catch {
        continue;
      }
      if (refName && refName !== config.name) {
        tableDeps.add(refName);
      }
    }

    if (tableDeps.size > 0) {
      deps[config.name] = [...tableDeps];
    }
  }

  return deps;
}

export const manageFkDeps: FkDeps = buildFkDepsFromSchema();

console.log(manageFkDeps);
