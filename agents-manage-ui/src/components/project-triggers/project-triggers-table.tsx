'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Copy, CopyPlus, History, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthSession } from '@/hooks/use-auth';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useOrgMembers } from '@/hooks/use-org-members';
import { deleteTriggerAction, updateTriggerEnabledAction } from '@/lib/actions/triggers';
import type { TriggerWithAgent } from '@/lib/api/project-triggers';

interface ProjectTriggersTableProps {
  triggers: TriggerWithAgent[];
  tenantId: string;
  projectId: string;
}

export function ProjectTriggersTable({ triggers, tenantId, projectId }: ProjectTriggersTableProps) {
  const router = useRouter();
  const [loadingTriggers, setLoadingTriggers] = useState<Set<string>>(new Set());
  const { members: orgMembers } = useOrgMembers(tenantId);
  const { user } = useAuthSession();
  const { isAdmin } = useIsOrgAdmin();

  const canManageTrigger = (trigger: TriggerWithAgent): boolean => {
    if (isAdmin) return true;
    if (!user) return false;
    return trigger.createdBy === user.id || trigger.runAsUserId === user.id;
  };

  const getUserDisplayName = (userId: string): string => {
    const member = orgMembers.find((m) => m.id === userId);
    return member?.name || member?.email || userId;
  };

  const copyWebhookUrl = async (webhookUrl: string, name: string) => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success(`Webhook URL for "${name}" copied to clipboard`);
    } catch (error) {
      console.error('Failed to copy webhook URL:', error);
      toast.error('Failed to copy webhook URL');
    }
  };

  const toggleEnabled = async (triggerId: string, agentId: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    setLoadingTriggers((prev) => new Set(prev).add(triggerId));

    try {
      const result = await updateTriggerEnabledAction(
        tenantId,
        projectId,
        agentId,
        triggerId,
        newEnabled
      );
      if (result.success) {
        toast.success(`Trigger ${newEnabled ? 'enabled' : 'disabled'}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Failed to update trigger:', error);
      toast.error('Failed to update trigger status');
    } finally {
      setLoadingTriggers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(triggerId);
        return newSet;
      });
    }
  };

  const deleteTrigger = async (triggerId: string, agentId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the trigger "${name}"?`)) {
      return;
    }

    setLoadingTriggers((prev) => new Set(prev).add(triggerId));

    try {
      const result = await deleteTriggerAction(tenantId, projectId, agentId, triggerId);
      if (result.success) {
        toast.success(`Trigger "${name}" deleted successfully`);
        router.refresh();
      } else {
        toast.error(result.error);
        setLoadingTriggers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(triggerId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Failed to delete trigger:', error);
      toast.error('Failed to delete trigger');
      setLoadingTriggers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(triggerId);
        return newSet;
      });
    }
  };

  const columns: ColumnDef<TriggerWithAgent>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      sortingFn: 'text',
      cell: ({ row }) => <div className="font-medium text-foreground">{row.original.name}</div>,
    },
    {
      id: 'agentName',
      accessorFn: (row) => row.agentName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <Link
          href={`/${tenantId}/projects/${projectId}/agents/${row.original.agentId}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {row.original.agentName}
        </Link>
      ),
    },
    {
      id: 'runAs',
      header: 'Run As',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.runAsUserId ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-muted-foreground truncate max-w-[150px] inline-block cursor-default">
                  {getUserDisplayName(row.original.runAsUserId)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <code className="font-mono text-xs">{row.original.runAsUserId}</code>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground max-w-md truncate">
          {row.original.description || '—'}
        </div>
      ),
    },
    {
      accessorKey: 'enabled',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      sortingFn: 'basic',
      cell: ({ row }) => {
        const isLoading = loadingTriggers.has(row.original.id);
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.enabled}
              onCheckedChange={() =>
                toggleEnabled(row.original.id, row.original.agentId, row.original.enabled)
              }
              disabled={isLoading}
            />
            <Badge className="uppercase" variant={row.original.enabled ? 'primary' : 'code'}>
              {row.original.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: 'webhookUrl',
      header: 'Webhook URL',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono truncate max-w-xs">
            {row.original.webhookUrl}
          </code>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => copyWebhookUrl(row.original.webhookUrl, row.original.name)}
            title="Copy webhook URL"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { className: 'w-12' },
      cell: ({ row }) => {
        const isLoading = loadingTriggers.has(row.original.id);
        const canManage = canManageTrigger(row.original);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link
                  href={`/${tenantId}/projects/${projectId}/triggers/webhooks/${row.original.agentId}/${row.original.id}/invocations`}
                >
                  <History className="w-4 h-4" />
                  View Invocations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild disabled={!canManage}>
                <Link
                  href={`/${tenantId}/projects/${projectId}/triggers/webhooks/${row.original.agentId}/${row.original.id}/edit`}
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={(() => {
                    const params = new URLSearchParams();
                    if (row.original.messageTemplate)
                      params.set('messageTemplate', row.original.messageTemplate);
                    if (row.original.inputSchema)
                      params.set('inputSchema', JSON.stringify(row.original.inputSchema));
                    if (row.original.outputTransform)
                      params.set('outputTransform', JSON.stringify(row.original.outputTransform));
                    params.set('enabled', String(row.original.enabled));
                    if (row.original.runAsUserId)
                      params.set('runAsUserId', row.original.runAsUserId);
                    return `/${tenantId}/projects/${projectId}/triggers/webhooks/${row.original.agentId}/new?${params.toString()}`;
                  })()}
                >
                  <CopyPlus className="w-4 h-4" />
                  Duplicate
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!canManage}
                onClick={() =>
                  deleteTrigger(row.original.id, row.original.agentId, row.original.name)
                }
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="rounded-lg border">
      <DataTable
        columns={columns}
        data={triggers}
        defaultSort={[{ id: 'name', desc: false }]}
        emptyState="No webhook triggers configured yet. Create a trigger to enable webhook-based agent invocation."
      />
    </div>
  );
}
