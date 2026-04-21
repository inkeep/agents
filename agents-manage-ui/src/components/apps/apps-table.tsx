'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { SelectOption } from '@/components/form/generic-select';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { App } from '@/lib/api/apps';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import type { Agent } from '@/lib/types/agent-full';
import { formatDateAgo } from '@/lib/utils/format-date';
import { AppItemMenu } from './app-item-menu';

interface AppsTableProps {
  apps: App[];
  agentLookup: Record<string, Agent>;
  agentOptions: SelectOption[];
  credentialOptions: SelectOption[];
}

const TYPE_LABELS: Record<string, string> = {
  web_client: 'Web Client',
  api: 'API',
  support_copilot: 'Support Copilot',
};

const TYPE_BADGE_VARIANT: Record<string, 'sky' | 'violet' | 'orange'> = {
  web_client: 'sky',
  api: 'violet',
  support_copilot: 'orange',
};

function AppIdCell({ appId }: { appId: string }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({});
  return (
    <button
      type="button"
      onClick={() => copyToClipboard(appId)}
      aria-label={isCopied ? 'Copied App ID' : 'Copy App ID to clipboard'}
      className="group/appid relative cursor-pointer bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono overflow-hidden"
    >
      {appId}
      <span className="absolute inset-y-0 right-0 flex items-center px-2 bg-gradient-to-l from-muted from-70% to-muted/0 opacity-0 group-hover/appid:opacity-100 transition-opacity">
        {isCopied ? (
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground" />
        )}
      </span>
    </button>
  );
}

export function AppsTable({ apps, agentLookup, agentOptions, credentialOptions }: AppsTableProps) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const {
    data: { canUse },
  } = useProjectPermissionsQuery();

  const columns: ColumnDef<App>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.original.name}</span>
          {row.original.description && (
            <span className="text-sm text-muted-foreground truncate max-w-[200px]">
              {row.original.description}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <Badge variant={TYPE_BADGE_VARIANT[row.original.type] ?? 'secondary'}>
          {TYPE_LABELS[row.original.type] ?? row.original.type}
        </Badge>
      ),
    },
    {
      id: 'defaultAgent',
      header: 'Default Agent',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.defaultAgentId && row.original.defaultProjectId ? (
          <Link
            href={`/${tenantId}/projects/${row.original.defaultProjectId}/agents/${row.original.defaultAgentId}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            {agentLookup[row.original.defaultAgentId]?.name ?? row.original.defaultAgentId}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground italic">None</span>
        ),
    },
    {
      id: 'appId',
      header: 'App ID',
      enableSorting: false,
      cell: ({ row }) => <AppIdCell appId={row.original.id} />,
    },
    {
      accessorKey: 'enabled',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      sortingFn: 'basic',
      cell: ({ row }) => (
        <Badge variant={row.original.enabled ? 'success' : 'warning'}>
          {row.original.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
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
      cell: ({ row }) =>
        canUse && (
          <AppItemMenu
            app={row.original}
            agentOptions={agentOptions}
            credentialOptions={credentialOptions}
          />
        ),
    },
  ];

  return (
    <div className="rounded-lg border">
      <DataTable
        columns={columns}
        data={apps}
        defaultSort={[{ id: 'name', desc: false }]}
        emptyState="No apps yet."
        getRowId={(row) => row.id}
      />
    </div>
  );
}
