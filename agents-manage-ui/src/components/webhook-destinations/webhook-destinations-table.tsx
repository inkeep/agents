'use client';

import { MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react';
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
import {
  deleteWebhookDestinationAction,
  testWebhookDestinationAction,
  updateWebhookDestinationEnabledAction,
} from '@/lib/actions/webhook-destinations';
import type { WebhookDestination } from '@/lib/api/webhook-destinations';

interface WebhookDestinationsTableProps {
  destinations: WebhookDestination[];
  tenantId: string;
  projectId: string;
  canEdit: boolean;
}

export function WebhookDestinationsTable({
  destinations,
  tenantId,
  projectId,
  canEdit,
}: WebhookDestinationsTableProps) {
  const router = useRouter();
  const [loadingIds, setLoadingIds] = useState(new Set<string>());

  function clearLoading(id: string) {
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function toggleEnabled(dest: WebhookDestination) {
    setLoadingIds((prev) => new Set(prev).add(dest.id));
    try {
      const result = await updateWebhookDestinationEnabledAction(
        tenantId,
        projectId,
        dest.id,
        !dest.enabled
      );
      if (result.success) {
        toast.success(`Outbound webhook ${!dest.enabled ? 'enabled' : 'disabled'}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
    clearLoading(dest.id);
  }

  async function handleDelete(dest: WebhookDestination) {
    if (!confirm(`Delete outbound webhook "${dest.name}"?`)) return;
    setLoadingIds((prev) => new Set(prev).add(dest.id));
    try {
      const result = await deleteWebhookDestinationAction(tenantId, projectId, dest.id);
      if (result.success) {
        toast.success('Outbound webhook deleted');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
    clearLoading(dest.id);
  }

  async function handleTest(dest: WebhookDestination) {
    setLoadingIds((prev) => new Set(prev).add(dest.id));
    try {
      const result = await testWebhookDestinationAction(tenantId, projectId, dest.id);
      if (result.success && result.data?.success) {
        toast.success(`Test event sent (HTTP ${result.data.statusCode})`);
      } else {
        toast.error(result.data?.error || result.error || 'Test failed');
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
    clearLoading(dest.id);
  }

  if (destinations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No outbound webhooks configured. Create one to start receiving events.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>URL</TableHead>
          <TableHead>Events</TableHead>
          <TableHead>Enabled</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {destinations.map((dest) => (
          <TableRow key={dest.id}>
            <TableCell className="font-medium">{dest.name}</TableCell>
            <TableCell className="max-w-[200px] truncate font-mono text-xs">{dest.url}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {dest.eventTypes.map((et) => (
                  <Badge key={et} variant="secondary" className="text-xs">
                    {et}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <Switch
                checked={dest.enabled}
                onCheckedChange={() => toggleEnabled(dest)}
                disabled={!canEdit || loadingIds.has(dest.id)}
              />
            </TableCell>
            <TableCell>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/${tenantId}/projects/${projectId}/webhook-destinations/${dest.id}/edit`}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleTest(dest)}>
                      <Send className="mr-2 h-4 w-4" />
                      Send Test Event
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(dest)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
