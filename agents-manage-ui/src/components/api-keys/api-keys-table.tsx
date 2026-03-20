'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { ApiKey } from '@/lib/api/api-keys';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import type { Agent } from '@/lib/types/agent-full';
import { formatDateAgo } from '@/lib/utils/format-date';
import { ApiKeyItemMenu } from './api-key-item-menu';
import { ExpirationIndicator } from './expiration-indicator';

interface ApiKeysTableProps {
  apiKeys: ApiKey[];
  agentLookup: Record<string, Agent>;
}

export function ApiKeysTable({ apiKeys, agentLookup }: ApiKeysTableProps) {
  const {
    data: { canUse },
  } = useProjectPermissionsQuery();
  const columns = useMemo<ColumnDef<ApiKey>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        sortingFn: 'text',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.name || 'No name'}</span>
            <span className="text-sm text-muted-foreground">
              {agentLookup[row.original.agentId]?.name || row.original.agentId}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'keyPrefix',
        header: 'Key',
        enableSorting: false,
        cell: ({ row }) => (
          <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
            {row.original.keyPrefix}
            {'•'.repeat(3)}
          </code>
        ),
      },
      {
        id: 'lastUsedAt',
        accessorFn: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt) : undefined),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last Used" />,
        sortingFn: 'datetime',
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.lastUsedAt ? formatDateAgo(row.original.lastUsedAt) : 'Never'}
          </span>
        ),
      },
      {
        accessorKey: 'expiresAt',
        header: 'Expires',
        enableSorting: false,
        cell: ({ row }) => <ExpirationIndicator expiresAt={row.original.expiresAt} />,
      },
      {
        id: 'createdAt',
        accessorFn: (row) => (row.createdAt ? new Date(row.createdAt) : undefined),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        sortingFn: 'datetime',
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.createdAt ? formatDateAgo(row.original.createdAt) : ''}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { className: 'w-12' },
        cell: ({ row }) => canUse && <ApiKeyItemMenu apiKey={row.original} />,
      },
    ],
    [agentLookup, canUse]
  );

  return (
    <div className="rounded-lg border">
      <DataTable
        columns={columns}
        data={apiKeys}
        defaultSort={[{ id: 'name', desc: false }]}
        emptyState="No API keys yet."
        getRowId={(row) => row.id}
      />
    </div>
  );
}
