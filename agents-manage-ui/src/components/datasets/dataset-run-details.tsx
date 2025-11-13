'use client';

import { ArrowLeft, ChevronRight, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateAgo, formatDateTime } from '@/app/utils/format-date';
import { DatasetItemFormDialog } from '@/components/dataset-items/dataset-item-form-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DatasetRunWithConversations } from '@/lib/api/dataset-runs';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';

interface DatasetRunDetailsProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  runId: string;
}

export function DatasetRunDetails({
  tenantId,
  projectId,
  datasetId,
  runId,
}: DatasetRunDetailsProps) {
  const [run, setRun] = useState<DatasetRunWithConversations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    async function loadRun() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchDatasetRun(tenantId, projectId, runId);
        setRun(response.data);
      } catch (err) {
        console.error('Error loading dataset run:', err);
        setError(err instanceof Error ? err.message : 'Failed to load run');
      } finally {
        setLoading(false);
      }
    }

    loadRun();
  }, [tenantId, projectId, runId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24 mt-2" />
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error || !run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error || 'Run not found'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${tenantId}/projects/${projectId}/datasets/${datasetId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dataset
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{run.runConfigName || `Run ${run.id.slice(0, 8)}`}</CardTitle>
          <CardDescription className="flex items-center gap-2 mt-1">
            <Clock className="h-3 w-3" />
            Created {formatDateAgo(run.createdAt)}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dataset Items ({run.items?.length || 0})</CardTitle>
          <CardDescription>Items executed in this dataset run</CardDescription>
        </CardHeader>
        <CardContent>
          {!run.items || run.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset Item</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead>Run At</TableHead>
                  <TableHead>Conversation ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.items.map((item) => {
                  // Get the first conversation for this item (or show all if multiple)
                  const primaryConversation = item.conversations?.[0];
                  const runAt = primaryConversation?.createdAt || item.createdAt;

                  // Extract input text from the item
                  const getInputPreview = (): string => {
                    const input = item.input;
                    if (!input) return 'No input';
                    
                    // Handle object input with messages
                    if (typeof input === 'object' && 'messages' in input) {
                      const messages = input.messages;
                      if (Array.isArray(messages) && messages.length > 0) {
                        const firstMessage = messages[0];
                        if (firstMessage?.content) {
                          const content = firstMessage.content;
                          if (typeof content === 'string') {
                            return content.length > 100
                              ? `${content.slice(0, 100)}...`
                              : content;
                          }
                          if (typeof content === 'object' && content !== null && 'text' in content) {
                            const text = (content as { text?: unknown }).text;
                            if (typeof text === 'string') {
                              return text.length > 100
                                ? `${text.slice(0, 100)}...`
                                : text;
                            }
                            return String(text || 'No input');
                          }
                        }
                      }
                    }
                    
                    return 'No input';
                  };

                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                            {String(item.id)}
                          </code>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground max-w-md truncate block">
                          {getInputPreview()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground max-w-md truncate block">
                          {primaryConversation?.output
                            ? primaryConversation.output.length > 100
                              ? `${primaryConversation.output.slice(0, 100)}...`
                              : primaryConversation.output
                            : 'No output'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDateTime(runAt)}</span>
                      </TableCell>
                      <TableCell>
                        {primaryConversation ? (
                          <Link
                            href={`/${tenantId}/projects/${projectId}/traces/conversations/${primaryConversation.conversationId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <code className="font-mono">
                              {primaryConversation.conversationId}
                            </code>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">No conversation</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedItemId && run.items && (
        <DatasetItemFormDialog
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          itemId={selectedItemId}
          isOpen={selectedItemId !== null}
          onOpenChange={(open) => !open && setSelectedItemId(null)}
          initialData={run.items.find((item) => item.id === selectedItemId) as any}
        />
      )}
    </div>
  );
}
