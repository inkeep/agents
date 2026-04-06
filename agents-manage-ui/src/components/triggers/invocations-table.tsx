'use client';

import { ArrowUpRight, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrgMembers } from '@/hooks/use-org-members';
import { fetchTriggerInvocations, type TriggerInvocation } from '@/lib/api/triggers';
import {
  formatInvocationDateTime,
  getInvocationStatusBadge,
  type InvocationStatus,
} from '@/lib/utils/invocation-display';
import { FilterTriggerComponent } from '../traces/filters/filter-trigger';
import { Combobox } from '../ui/combobox';

const POLLING_INTERVAL_MS = 3000;

type InvocationWithBatch = TriggerInvocation & { batchId?: string | null };

interface InvocationsTableProps {
  invocations: TriggerInvocation[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  tenantId: string;
  projectId: string;
  agentId?: string;
  triggerId?: string;
  isMultiUser?: boolean;
  currentStatus?: 'pending' | 'success' | 'failed';
}

interface InvocationGroup {
  key: string;
  receivedAt: string;
  invocations: InvocationWithBatch[];
  summary: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
}

function groupInvocationsByBatch(invocations: TriggerInvocation[]): InvocationGroup[] {
  if (invocations.length === 0) return [];

  const batchMap = new Map<string, InvocationWithBatch[]>();
  const ungrouped: InvocationWithBatch[] = [];

  for (const inv of invocations) {
    const batchId = (inv as InvocationWithBatch).batchId;
    if (batchId) {
      const group = batchMap.get(batchId);
      if (group) {
        group.push(inv);
      } else {
        batchMap.set(batchId, [inv]);
      }
    } else {
      ungrouped.push(inv);
    }
  }

  const groups: InvocationGroup[] = [];

  for (const [batchId, invs] of batchMap) {
    const earliest = invs.reduce((min, inv) =>
      new Date(inv.createdAt) < new Date(min.createdAt) ? inv : min
    );
    groups.push({
      key: batchId,
      receivedAt: earliest.createdAt,
      invocations: invs,
      summary: {
        total: invs.length,
        success: invs.filter((i) => i.status === 'success').length,
        failed: invs.filter((i) => i.status === 'failed').length,
        pending: invs.filter((i) => i.status === 'pending').length,
      },
    });
  }

  for (const inv of ungrouped) {
    groups.push({
      key: inv.id,
      receivedAt: inv.createdAt,
      invocations: [inv],
      summary: {
        total: 1,
        success: inv.status === 'success' ? 1 : 0,
        failed: inv.status === 'failed' ? 1 : 0,
        pending: inv.status === 'pending' ? 1 : 0,
      },
    });
  }

  return groups.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
}

function GroupStatusSummary({ summary }: { summary: InvocationGroup['summary'] }) {
  if (summary.total === 1) return null;

  const parts: {
    label: string;
    count: number;
    variant: 'default' | 'destructive' | 'secondary' | 'outline';
  }[] = [];
  if (summary.success > 0)
    parts.push({ label: 'success', count: summary.success, variant: 'default' });
  if (summary.failed > 0)
    parts.push({ label: 'failed', count: summary.failed, variant: 'destructive' });
  if (summary.pending > 0)
    parts.push({ label: 'pending', count: summary.pending, variant: 'outline' });

  return (
    <div className="flex items-center gap-1.5">
      {parts.map((p) => (
        <Badge key={p.label} variant={p.variant} className="text-xs">
          {p.count} {p.label}
        </Badge>
      ))}
    </div>
  );
}

export function InvocationsTable({
  invocations: initialInvocations,
  metadata,
  tenantId,
  projectId,
  agentId,
  triggerId,
  isMultiUser,
  currentStatus,
}: InvocationsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invocations, setInvocations] = useState(initialInvocations);
  const [prevInitial, setPrevInitial] = useState(initialInvocations);
  if (prevInitial !== initialInvocations) {
    setPrevInitial(initialInvocations);
    setInvocations(initialInvocations);
  }

  const [expandedRows, setExpandedRows] = useState(new Set<string>());
  const [expandedGroups, setExpandedGroups] = useState(new Set<string>());
  const { members: orgMembers } = useOrgMembers(tenantId);

  const hasTransientInvocations = invocations.some((inv) => inv.status === 'pending');

  useEffect(() => {
    if (!hasTransientInvocations || !agentId || !triggerId) return;

    const poll = async () => {
      try {
        const response = await fetchTriggerInvocations(tenantId, projectId, agentId, triggerId, {
          limit: 50,
        });
        setInvocations(response.data);
      } catch (error) {
        console.error('Failed to poll invocations:', error);
      }
    };

    const intervalId = setInterval(poll, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasTransientInvocations, tenantId, projectId, agentId, triggerId]);

  function getUserDisplayName(userId: string | null | undefined) {
    if (!userId) return '—';
    const member = orgMembers.find((m) => m.id === userId);
    return member?.name || member?.email || userId;
  }

  function formatDate(dateString: string): string {
    const normalizedDateString = dateString.endsWith('Z') ? dateString : `${dateString}Z`;
    const date = new Date(normalizedDateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    params.delete('page');
    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`?${params.toString()}`);
  };

  const filterControls = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Combobox
          defaultValue={currentStatus || 'all'}
          notFoundMessage={'No status found.'}
          onSelect={(value) => {
            handleStatusChange(value);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'success', label: 'Success' },
            { value: 'failed', label: 'Failed' },
            { value: 'pending', label: 'Pending' },
          ]}
          TriggerComponent={
            <FilterTriggerComponent
              disabled={false}
              filterLabel={currentStatus ? 'Status' : 'All statuses'}
              isRemovable={true}
              onDeleteFilter={() => {
                handleStatusChange('all');
              }}
              multipleCheckboxValues={currentStatus ? [currentStatus] : []}
              options={[
                { value: 'all', label: 'All' },
                { value: 'success', label: 'Success' },
                { value: 'failed', label: 'Failed' },
                { value: 'pending', label: 'Pending' },
              ]}
            />
          }
        />
      </div>
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Badge variant="count">{metadata.total}</Badge> invocation
        {metadata.total !== 1 ? 's' : ''}
      </div>
    </div>
  );

  const pagination = metadata.pages > 1 && (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(metadata.page - 1)}
        disabled={metadata.page <= 1}
      >
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {metadata.page} of {metadata.pages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(metadata.page + 1)}
        disabled={metadata.page >= metadata.pages}
      >
        Next
      </Button>
    </div>
  );

  if (isMultiUser) {
    const groups = groupInvocationsByBatch(invocations);

    return (
      <div className="space-y-4">
        {filterControls}
        <div className="rounded-lg border">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50">
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground w-8" />
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                    Received At
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                    Users
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                    Conversation
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="h-24 text-center text-muted-foreground">
                      No invocations found.
                    </td>
                  </tr>
                )}
                {groups.map((group) => {
                  const isExpanded = expandedGroups.has(group.key);

                  return (
                    <Fragment key={group.key}>
                      <tr
                        className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleGroup(group.key)}
                      >
                        <td className="p-4 align-middle">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <div className="font-mono text-sm">
                            {formatInvocationDateTime(group.receivedAt)}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          {group.summary.total === 1 ? (
                            getInvocationStatusBadge(
                              group.invocations[0].status as InvocationStatus
                            )
                          ) : (
                            <GroupStatusSummary summary={group.summary} />
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <span className="text-sm text-muted-foreground">
                            {group.summary.total} user{group.summary.total !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="p-4 align-middle" />
                      </tr>
                      {isExpanded &&
                        group.invocations.map((inv) => (
                          <tr
                            key={inv.id}
                            className="border-b transition-colors hover:bg-muted/30 bg-muted/10"
                          >
                            <td className="p-4 align-middle" />
                            <td className="p-4 align-middle pl-8">
                              <div className="text-sm font-medium">
                                {getUserDisplayName(
                                  (inv as TriggerInvocation & { runAsUserId?: string }).runAsUserId
                                )}
                              </div>
                            </td>
                            <td className="p-4 align-middle">
                              {getInvocationStatusBadge(inv.status as InvocationStatus)}
                            </td>
                            <td className="p-4 align-middle">
                              {inv.conversationId ? (
                                <Link
                                  href={`/${tenantId}/projects/${projectId}/traces/conversations/${inv.conversationId}`}
                                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View trace
                                  <ArrowUpRight className="w-3 h-3" />
                                </Link>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="p-4 align-middle">
                              {inv.errorMessage && (
                                <span className="text-destructive text-sm truncate max-w-xs block">
                                  {inv.errorMessage}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {pagination}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filterControls}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead className="w-12" />
              <TableHead>Timestamp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Conversation</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invocations.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No invocations found.
                </TableCell>
              </TableRow>
            ) : (
              invocations.map((invocation) => {
                const isExpanded = expandedRows.has(invocation.id);
                return (
                  <Fragment key={invocation.id}>
                    <TableRow noHover className="cursor-pointer hover:bg-muted/50">
                      <TableCell onClick={() => toggleRow(invocation.id)}>
                        <Button variant="ghost" size="icon-sm">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell onClick={() => toggleRow(invocation.id)}>
                        <div className="font-mono text-sm">{formatDate(invocation.createdAt)}</div>
                      </TableCell>
                      <TableCell onClick={() => toggleRow(invocation.id)}>
                        <StatusBadge status={invocation.status} />
                      </TableCell>
                      <TableCell>
                        {invocation.conversationId ? (
                          <Link
                            href={`/${tenantId}/projects/${projectId}/traces/conversations/${invocation.conversationId}`}
                            className="flex items-center gap-1 text-primary hover:underline font-mono uppercase text-xs"
                          >
                            View
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={() => toggleRow(invocation.id)}>
                        {invocation.errorMessage ? (
                          <span className="text-destructive text-sm truncate max-w-xs block">
                            {invocation.errorMessage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow noHover>
                        <TableCell colSpan={5} className="bg-muted/30 p-6">
                          <div className="w-0 min-w-full space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Request Payload</h4>
                              <pre className="bg-background border rounded-md p-4 text-xs overflow-x-auto max-h-64">
                                {JSON.stringify(invocation.requestPayload, null, 2)}
                              </pre>
                            </div>
                            {invocation.transformedPayload && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Transformed Payload</h4>
                                <pre className="bg-background border rounded-md p-4 text-xs overflow-x-auto max-h-64">
                                  {JSON.stringify(invocation.transformedPayload, null, 2)}
                                </pre>
                              </div>
                            )}
                            {invocation.errorMessage && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 text-destructive">
                                  Error Message
                                </h4>
                                <p className="text-sm text-destructive bg-background border border-destructive rounded-md p-4">
                                  {invocation.errorMessage}
                                </p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {pagination}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'primary' | 'code' | 'error'> = {
    success: 'primary',
    pending: 'code',
    failed: 'error',
  };

  return (
    <Badge className="uppercase" variant={variants[status] || 'code'}>
      {status}
    </Badge>
  );
}
