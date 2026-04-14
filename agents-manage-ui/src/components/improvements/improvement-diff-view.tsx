'use client';

import { ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { FkColumnLink, ImprovementDiffResponse } from '@/lib/api/improvements';

export interface ExcludedRow {
  table: string;
  primaryKey: Record<string, string>;
  diffType: string;
}

interface ImprovementDiffViewProps {
  tenantId: string;
  projectId: string;
  diff: ImprovementDiffResponse;
  onExcludedRowsChange?: (excluded: ExcludedRow[]) => void;
}

interface GroupedEntity {
  parentTable: string;
  parentRow: Record<string, unknown>;
  parentPk: Record<string, string>;
  parentKey: string;
  children: {
    table: string;
    row: Record<string, unknown>;
    pk: Record<string, string>;
    key: string;
  }[];
}

function DiffTypeBadge({ type }: { type: string }) {
  const variant = type === 'added' ? 'default' : type === 'removed' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{type}</Badge>;
}

function getChangedFields(row: Record<string, unknown>): {
  field: string;
  from: unknown;
  to: unknown;
  diffType: string;
}[] {
  const fields: { field: string; from: unknown; to: unknown; diffType: string }[] = [];
  const diffType = String(row.diff_type ?? 'modified');

  for (const key of Object.keys(row)) {
    if (key.startsWith('from_') && !key.startsWith('from_commit')) {
      const field = key.slice(5);
      const toKey = `to_${field}`;
      const fromVal = row[key];
      const toVal = row[toKey];

      if (
        diffType === 'added' ||
        diffType === 'removed' ||
        stringify(fromVal) !== stringify(toVal)
      ) {
        fields.push({ field, from: fromVal, to: toVal, diffType });
      }
    }
  }
  return fields;
}

function stringify(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function getRowPk(
  tableName: string,
  row: Record<string, unknown>,
  pkMap?: Record<string, string[]>
): Record<string, string> {
  const rawTable = tableName.replace(/^public\./, '');
  const pkCols = pkMap?.[rawTable];
  if (pkCols && pkCols.length > 0) {
    const pk: Record<string, string> = {};
    for (const col of pkCols) {
      pk[col] = String(row[`to_${col}`] ?? row[`from_${col}`] ?? '');
    }
    return pk;
  }
  return { id: String(row.to_id ?? row.from_id ?? '') };
}

function getRowKey(tableName: string, pk: Record<string, string>): string {
  const raw = tableName.replace(/^public\./, '');
  return `${raw}::${Object.entries(pk).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')}`;
}

function getRowColValue(row: Record<string, unknown>, col: string): string {
  return String(row[`to_${col}`] ?? row[`from_${col}`] ?? '');
}

function findChildren(
  parentTable: string,
  parentRow: Record<string, unknown>,
  fkLinks: FkColumnLink[],
  allTables: Record<string, Record<string, unknown>[]>,
  pkMap?: Record<string, string[]>,
  depth = 0
): { table: string; row: Record<string, unknown>; pk: Record<string, string>; key: string }[] {
  if (depth > 5) return [];
  const children: {
    table: string;
    row: Record<string, unknown>;
    pk: Record<string, string>;
    key: string;
  }[] = [];
  const rawParent = parentTable.replace(/^public\./, '');
  const childLinks = fkLinks.filter((link) => link.parentTable === rawParent);

  for (const link of childLinks) {
    const childTableKey =
      Object.keys(allTables).find(
        (t) => t.replace(/^public\./, '') === link.childTable
      ) ?? link.childTable;
    const childRows = allTables[childTableKey] ?? [];

    for (const childRow of childRows) {
      const matches = link.columns.every(
        ({ child, parent }) =>
          getRowColValue(childRow, child) === getRowColValue(parentRow, parent)
      );
      if (matches) {
        const pk = getRowPk(childTableKey, childRow, pkMap);
        const key = getRowKey(childTableKey, pk);
        children.push({ table: childTableKey, row: childRow, pk, key });
        const grandchildren = findChildren(
          childTableKey,
          childRow,
          fkLinks,
          allTables,
          pkMap,
          depth + 1
        );
        children.push(...grandchildren);
      }
    }
  }

  return children;
}

function buildEntityGroups(
  diff: ImprovementDiffResponse,
  fkLinks: FkColumnLink[],
  pkMap?: Record<string, string[]>
): { groups: GroupedEntity[]; ungroupedTables: Map<string, Record<string, unknown>[]> } {
  const groups: GroupedEntity[] = [];
  const claimedKeys = new Set<string>();

  const diffTableNames = new Set(diff.summary.map((s) => s.tableName.replace(/^public\./, '')));

  const childTableNames = new Set(
    fkLinks
      .filter((l) => diffTableNames.has(l.parentTable))
      .map((l) => l.childTable)
  );

  const rootSummaries = diff.summary.filter(
    (s) => !childTableNames.has(s.tableName.replace(/^public\./, ''))
  );

  for (const s of rootSummaries) {
    const rows = diff.tables[s.tableName] ?? [];
    for (const row of rows) {
      const pk = getRowPk(s.tableName, row, pkMap);
      const key = getRowKey(s.tableName, pk);
      const children = findChildren(s.tableName, row, fkLinks, diff.tables, pkMap);

      if (children.length > 0) {
        groups.push({
          parentTable: s.tableName,
          parentRow: row,
          parentPk: pk,
          parentKey: key,
          children,
        });
        claimedKeys.add(key);
        for (const c of children) claimedKeys.add(c.key);
      }
    }
  }

  const ungroupedTables = new Map<string, Record<string, unknown>[]>();
  for (const s of diff.summary) {
    const rows = (diff.tables[s.tableName] ?? []).filter((r) => {
      const pk = getRowPk(s.tableName, r, pkMap);
      return !claimedKeys.has(getRowKey(s.tableName, pk));
    });
    if (rows.length > 0) {
      ungroupedTables.set(s.tableName, rows);
    }
  }

  return { groups, ungroupedTables };
}

function DiffValue({ value, variant }: { value: unknown; variant: 'from' | 'to' }) {
  const str = stringify(value);
  if (!str) return <span className="text-muted-foreground italic">empty</span>;

  const isLong = str.length > 120 || str.includes('\n');
  const bgClass =
    variant === 'from' ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30';
  const borderClass =
    variant === 'from'
      ? 'border-red-200 dark:border-red-800'
      : 'border-green-200 dark:border-green-800';

  if (isLong) {
    return (
      <pre
        className={`text-xs font-mono p-2 rounded border ${bgClass} ${borderClass} whitespace-pre-wrap break-all max-h-64 overflow-auto`}
      >
        {str}
      </pre>
    );
  }

  return (
    <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${bgClass} ${borderClass} border`}>
      {str}
    </code>
  );
}

function RowDiffCard({
  tableName,
  row,
  pk,
  isExcluded,
  isCascaded,
  indent,
  onToggle,
}: {
  tableName: string;
  row: Record<string, unknown>;
  pk: Record<string, string>;
  isExcluded: boolean;
  isCascaded: boolean;
  indent: boolean;
  onToggle: () => void;
}) {
  const diffType = String(row.diff_type ?? 'modified');
  const changedFields = getChangedFields(row);
  const isDisabled = isCascaded && !isExcluded;
  const idDisplay = Object.entries(pk)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  return (
    <div
      className={`border rounded-lg p-3 space-y-2 ${indent ? 'ml-6' : ''} ${isExcluded || isCascaded ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={!isExcluded && !isCascaded}
          disabled={isDisabled}
          onCheckedChange={onToggle}
        />
        <DiffTypeBadge type={diffType} />
        <span className="font-mono text-muted-foreground font-medium">
          {tableName.replace(/^public\./, '')}
        </span>
        {idDisplay && (
          <span className="font-mono text-muted-foreground/70">{idDisplay}</span>
        )}
        {isCascaded && !isExcluded && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 gap-1">
            <Link2 className="h-3 w-3" />
            via parent
          </Badge>
        )}
      </div>
      {changedFields.length > 0 ? (
        <div className="space-y-2">
          {changedFields.map((cf) => (
            <div
              key={cf.field}
              className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 items-start text-xs"
            >
              <span className="font-mono font-medium text-muted-foreground pt-0.5">
                {cf.field}
              </span>
              <div className="space-y-1">
                {cf.diffType !== 'added' && (
                  <div className="flex items-start gap-1">
                    <span className="text-red-600 dark:text-red-400 font-mono shrink-0">−</span>
                    <DiffValue value={cf.from} variant="from" />
                  </div>
                )}
                {cf.diffType !== 'removed' && (
                  <div className="flex items-start gap-1">
                    <span className="text-green-600 dark:text-green-400 font-mono shrink-0">+</span>
                    <DiffValue value={cf.to} variant="to" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No field-level changes detected</p>
      )}
    </div>
  );
}

function EntityGroupCard({
  group,
  excludedKeys,
  onToggleGroup,
  onToggleRow,
}: {
  group: GroupedEntity;
  excludedKeys: Set<string>;
  onToggleGroup: (group: GroupedEntity) => void;
  onToggleRow: (key: string, tableName: string, row: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const allKeys = [group.parentKey, ...group.children.map((c) => c.key)];
  const allExcluded = allKeys.every((k) => excludedKeys.has(k));
  const someExcluded = allKeys.some((k) => excludedKeys.has(k));
  const parentExcluded = excludedKeys.has(group.parentKey);

  const parentIdDisplay = Object.values(group.parentPk).join(' / ');
  const childTables = [...new Set(group.children.map((c) => c.table.replace(/^public\./, '')))];

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allExcluded ? false : someExcluded ? 'indeterminate' : true}
            onCheckedChange={() => onToggleGroup(group)}
          />
          <button
            type="button"
            className="flex items-center gap-2 flex-1 cursor-pointer select-none"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <CardTitle className="text-sm font-mono">
              {group.parentTable.replace(/^public\./, '')}
            </CardTitle>
            <span className="text-xs text-muted-foreground font-mono">{parentIdDisplay}</span>
          </button>
          <Badge variant="outline" className="ml-auto">
            {1 + group.children.length} {group.children.length === 0 ? 'change' : 'changes'}
          </Badge>
          {childTables.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              + {childTables.join(', ')}
            </Badge>
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-3">
          <RowDiffCard
            tableName={group.parentTable}
            row={group.parentRow}
            pk={group.parentPk}
            isExcluded={parentExcluded}
            isCascaded={false}
            indent={false}
            onToggle={() => onToggleRow(group.parentKey, group.parentTable, group.parentRow)}
          />
          {group.children.map((child) => (
            <RowDiffCard
              key={child.key}
              tableName={child.table}
              row={child.row}
              pk={child.pk}
              isExcluded={excludedKeys.has(child.key)}
              isCascaded={parentExcluded && !excludedKeys.has(child.key)}
              indent={true}
              onToggle={() => onToggleRow(child.key, child.table, child.row)}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function StandaloneTableDiff({
  tableName,
  rows,
  excludedKeys,
  pkMap,
  onToggleRow,
}: {
  tableName: string;
  rows: Record<string, unknown>[];
  excludedKeys: Set<string>;
  pkMap?: Record<string, string[]>;
  onToggleRow: (key: string, tableName: string, row: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const excludedCount = rows.filter((r) => {
    const pk = getRowPk(tableName, r, pkMap);
    return excludedKeys.has(getRowKey(tableName, pk));
  }).length;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CardTitle className="text-sm font-mono">{tableName}</CardTitle>
          {excludedCount > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              {excludedCount} excluded
            </Badge>
          )}
          <Badge variant="outline" className="ml-auto">
            {rows.length} {rows.length === 1 ? 'change' : 'changes'}
          </Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {rows.map((row, i) => {
            const pk = getRowPk(tableName, row, pkMap);
            const rowKey = getRowKey(tableName, pk);
            return (
              <RowDiffCard
                key={i}
                tableName={tableName}
                row={row}
                pk={pk}
                isExcluded={excludedKeys.has(rowKey)}
                isCascaded={false}
                indent={false}
                onToggle={() => onToggleRow(rowKey, tableName, row)}
              />
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

export function ImprovementDiffView({ diff, onExcludedRowsChange }: ImprovementDiffViewProps) {
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [excludedRowMap, setExcludedRowMap] = useState<Map<string, ExcludedRow>>(new Map());

  const fkLinks = diff.fkLinks ?? [];
  const pkMap = diff.pkMap;

  const { groups, ungroupedTables } = buildEntityGroups(diff, fkLinks, pkMap);

  const emitExcluded = (nextKeys: Set<string>, nextMap: Map<string, ExcludedRow>) => {
    setExcludedKeys(nextKeys);
    setExcludedRowMap(nextMap);
    onExcludedRowsChange?.(Array.from(nextMap.values()));
  };

  const handleToggleRow = (key: string, tableName: string, row: Record<string, unknown>) => {
    const nextKeys = new Set(excludedKeys);
    const nextMap = new Map(excludedRowMap);
    const pk = getRowPk(tableName, row, pkMap);

    if (nextKeys.has(key)) {
      nextKeys.delete(key);
      nextMap.delete(key);
    } else {
      nextKeys.add(key);
      nextMap.set(key, {
        table: tableName.replace(/^public\./, ''),
        primaryKey: pk,
        diffType: String(row.diff_type ?? 'modified'),
      });
    }

    const group = groups.find((g) => g.parentKey === key);
    if (group && nextKeys.has(key)) {
      for (const child of group.children) {
        nextKeys.add(child.key);
        nextMap.set(child.key, {
          table: child.table.replace(/^public\./, ''),
          primaryKey: child.pk,
          diffType: String(child.row.diff_type ?? 'modified'),
        });
      }
    } else if (group && !nextKeys.has(key)) {
      for (const child of group.children) {
        nextKeys.delete(child.key);
        nextMap.delete(child.key);
      }
    }

    emitExcluded(nextKeys, nextMap);
  };

  const handleToggleGroup = (group: GroupedEntity) => {
    const nextKeys = new Set(excludedKeys);
    const nextMap = new Map(excludedRowMap);
    const allKeys = [group.parentKey, ...group.children.map((c) => c.key)];
    const allExcluded = allKeys.every((k) => nextKeys.has(k));

    if (allExcluded) {
      for (const k of allKeys) {
        nextKeys.delete(k);
        nextMap.delete(k);
      }
    } else {
      nextKeys.add(group.parentKey);
      nextMap.set(group.parentKey, {
        table: group.parentTable.replace(/^public\./, ''),
        primaryKey: group.parentPk,
        diffType: String(group.parentRow.diff_type ?? 'modified'),
      });
      for (const child of group.children) {
        nextKeys.add(child.key);
        nextMap.set(child.key, {
          table: child.table.replace(/^public\./, ''),
          primaryKey: child.pk,
          diffType: String(child.row.diff_type ?? 'modified'),
        });
      }
    }

    emitExcluded(nextKeys, nextMap);
  };

  if (diff.summary.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No changes detected</p>
        <p className="text-sm mt-1">This improvement branch has no differences from main.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {diff.summary.length} {diff.summary.length === 1 ? 'table' : 'tables'} changed
        </span>
        <span>·</span>
        <span className="font-mono">{diff.branchName}</span>
        {excludedKeys.size > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-600">
              {excludedKeys.size} {excludedKeys.size === 1 ? 'row' : 'rows'} excluded from merge
            </span>
          </>
        )}
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <EntityGroupCard
            key={group.parentKey}
            group={group}
            excludedKeys={excludedKeys}
            onToggleGroup={handleToggleGroup}
            onToggleRow={handleToggleRow}
          />
        ))}

        {[...ungroupedTables.entries()].map(([tableName, rows]) => (
          <StandaloneTableDiff
            key={tableName}
            tableName={tableName}
            rows={rows}
            excludedKeys={excludedKeys}
            pkMap={pkMap}
            onToggleRow={handleToggleRow}
          />
        ))}
      </div>
    </div>
  );
}
