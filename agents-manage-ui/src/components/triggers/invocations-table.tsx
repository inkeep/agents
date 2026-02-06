'use client';

import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';
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
import type { TriggerInvocation } from '@/lib/api/triggers';
import { FilterTriggerComponent } from '../traces/filters/filter-trigger';
import { Combobox } from '../ui/combobox';

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
  currentStatus?: 'pending' | 'success' | 'failed';
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

                    {/* Expanded Details Row */}
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
