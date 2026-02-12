'use client';

import { Copy, History, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Webhook URL</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {triggers.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No webhook triggers configured yet. Create a trigger to enable webhook-based agent
                invocation.
              </TableCell>
            </TableRow>
          ) : (
            triggers.map((trigger) => {
              const isLoading = loadingTriggers.has(trigger.id);
              return (
                <TableRow key={trigger.id} noHover>
                  <TableCell>
                    <div className="font-medium text-foreground">{trigger.name}</div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/agents/${trigger.agentId}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {trigger.agentName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground max-w-md truncate">
                      {trigger.description || '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={trigger.enabled}
                        onCheckedChange={() =>
                          toggleEnabled(trigger.id, trigger.agentId, trigger.enabled)
                        }
                        disabled={isLoading}
                      />
                      <Badge className="uppercase" variant={trigger.enabled ? 'primary' : 'code'}>
                        {trigger.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono truncate max-w-xs">
                        {trigger.webhookUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyWebhookUrl(trigger.webhookUrl, trigger.name)}
                        title="Copy webhook URL"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/triggers/webhooks/${trigger.agentId}/${trigger.id}/invocations`}
                          >
                            <History className="w-4 h-4" />
                            View Invocations
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/triggers/webhooks/${trigger.agentId}/${trigger.id}/edit`}
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteTrigger(trigger.id, trigger.agentId, trigger.name)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
