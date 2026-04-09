'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImprovementDiffResponse } from '@/lib/api/improvements';

interface ImprovementDiffViewProps {
  tenantId: string;
  projectId: string;
  diff: ImprovementDiffResponse;
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

      if (diffType === 'added' || diffType === 'removed' || stringify(fromVal) !== stringify(toVal)) {
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

function DiffValue({ value, variant }: { value: unknown; variant: 'from' | 'to' }) {
  const str = stringify(value);
  if (!str) return <span className="text-muted-foreground italic">empty</span>;

  const isLong = str.length > 120 || str.includes('\n');
  const bgClass = variant === 'from' ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30';
  const borderClass = variant === 'from' ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800';

  if (isLong) {
    return (
      <pre className={`text-xs font-mono p-2 rounded border ${bgClass} ${borderClass} whitespace-pre-wrap break-all max-h-64 overflow-auto`}>
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

function TableDiff({ tableName, rows }: { tableName: string; rows: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CardTitle className="text-sm font-mono">{tableName}</CardTitle>
          <Badge variant="outline" className="ml-auto">
            {rows.length} {rows.length === 1 ? 'change' : 'changes'}
          </Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {rows.map((row, i) => {
            const diffType = String(row.diff_type ?? 'modified');
            const changedFields = getChangedFields(row);
            const idField = String(row.to_id ?? row.from_id ?? '');

            return (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <DiffTypeBadge type={diffType} />
                  {idField && (
                    <span className="font-mono text-muted-foreground">
                      id: {idField}
                    </span>
                  )}
                </div>
                {changedFields.length > 0 ? (
                  <div className="space-y-2">
                    {changedFields.map((cf) => (
                      <div key={cf.field} className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 items-start text-xs">
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
          })}
        </CardContent>
      )}
    </Card>
  );
}

export function ImprovementDiffView({ diff }: ImprovementDiffViewProps) {
  if (diff.summary.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No changes detected</p>
        <p className="text-sm mt-1">
          This improvement branch has no differences from main.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{diff.summary.length} {diff.summary.length === 1 ? 'table' : 'tables'} changed</span>
        <span>·</span>
        <span className="font-mono">{diff.branchName}</span>
      </div>

      <div className="space-y-3">
        {diff.summary.map((s) => {
          const rows = diff.tables[s.tableName] ?? [];
          return <TableDiff key={s.tableName} tableName={s.tableName} rows={rows} />;
        })}
      </div>
    </div>
  );
}
