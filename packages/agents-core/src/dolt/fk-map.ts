import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../db/manage/manage-schema';

export type FkDeps = Record<string, string[]>;

export interface FkColumnLink {
  childTable: string;
  parentTable: string;
  columns: { child: string; parent: string }[];
}

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

function buildFkColumnLinksFromSchema(): FkColumnLink[] {
  const links: FkColumnLink[] = [];

  for (const value of Object.values(schema)) {
    if (value == null || typeof value !== 'object') continue;

    let config: ReturnType<typeof getTableConfig>;
    try {
      config = getTableConfig(value as any);
    } catch {
      continue;
    }

    if (!config?.name) continue;

    for (const fk of config.foreignKeys ?? []) {
      const ref = fk.reference();
      let parentName: string | undefined;
      try {
        parentName = getTableConfig(ref.foreignTable as any).name;
      } catch {
        continue;
      }
      if (!parentName || parentName === config.name) continue;

      const childCols = ref.columns.map((c: any) => c.name as string);
      const parentCols = ref.foreignColumns.map((c: any) => c.name as string);
      if (childCols.length !== parentCols.length || childCols.length === 0) continue;

      links.push({
        childTable: config.name,
        parentTable: parentName,
        columns: childCols.map((child: string, i: number) => ({
          child,
          parent: parentCols[i],
        })),
      });
    }
  }

  return links;
}

export const manageFkColumnLinks: FkColumnLink[] = buildFkColumnLinksFromSchema();
