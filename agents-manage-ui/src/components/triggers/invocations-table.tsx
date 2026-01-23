'use client';

import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TriggerInvocation } from '@/lib/api/triggers';

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
  currentStatus?: 'pending' | 'success' | 'failed' | 'rejected';
}

function formatDate(dateString: string): string {
  // Ensure the date is parsed as UTC if no timezone is specified
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

function calculateResponseTime(createdAt: string, respondedAt: string | null | undefined): string | null {
  if (!respondedAt) return null;
  const created = new Date(createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`);
  const responded = new Date(respondedAt.endsWith('Z') ? respondedAt : `${respondedAt}Z`);
  const diffMs = responded.getTime() - created.getTime();
  if (diffMs < 1000) {
    return `${diffMs}ms`;
  }
  return `${(diffMs / 1000).toFixed(2)}s`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    success: 'default',
    pending: 'secondary',
    failed: 'destructive',
    rejected: 'outline',
  };

  return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
}

export function InvocationsTable({
  invocations,
  metadata,
  tenantId,
  projectId,
  currentStatus,
}: InvocationsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (invocationId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(invocationId)) {
        newSet.delete(invocationId);
      } else {
        newSet.add(invocationId);
      }
      return newSet;
    });
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    params.delete('page'); // Reset to page 1
    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by status:</span>
          <Select value={currentStatus || 'all'} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          Total: {metadata.total} invocation{metadata.total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
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
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={() => toggleRow(invocation.id)}>
                        {invocation.errorMessage || invocation.errorCode ? (
                          <span className="text-destructive text-sm truncate max-w-xs block">
                            {invocation.errorCode && (
                              <span className="font-mono mr-1">[{invocation.errorCode}]</span>
                            )}
                            {invocation.errorMessage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded Details Row */}
                    {isExpanded && (
                      <TableRow noHover>
                        <TableCell colSpan={5} className="bg-muted/30 p-6">
                          <div className="space-y-4">
                            {/* Response Time */}
                            {invocation.respondedAt && (
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">Response Time:</span>
                                <span className="font-mono">
                                  {calculateResponseTime(invocation.createdAt, invocation.respondedAt)}
                                </span>
                              </div>
                            )}
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
                            {(invocation.errorMessage || invocation.errorCode) && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 text-destructive">
                                  Error {invocation.errorCode && `(HTTP ${invocation.errorCode})`}
                                </h4>
                                <p className="text-sm text-destructive bg-background border border-destructive rounded-md p-4">
                                  {invocation.errorMessage || 'Unknown error'}
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

      {/* Pagination */}
      {metadata.pages > 1 && (
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
      )}
    </div>
  );
}
