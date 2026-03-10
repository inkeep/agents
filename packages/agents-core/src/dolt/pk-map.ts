import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../db/manage/manage-schema';

export type PkMap = Record<string, string[]>;

function buildPkMapFromSchema(): PkMap {
  const pkMap: PkMap = {};

  for (const value of Object.values(schema)) {
    if (value == null || typeof value !== 'object') continue;

    let config: ReturnType<typeof getTableConfig>;
    try {
      config = getTableConfig(value as any);
    } catch {
      continue;
    }

    if (!config?.name || !config.primaryKeys?.length) continue;

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    if (pkColumns && pkColumns.length > 0) {
      pkMap[config.name] = pkColumns;
    }
  }

  return pkMap;
}

export const managePkMap: PkMap = buildPkMapFromSchema();

export const isValidManageTable = (tableName: string): boolean => {
  return tableName in managePkMap;
};
