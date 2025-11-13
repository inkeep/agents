'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDateTimeTable } from '@/app/utils/format-date';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import type { EvaluationResult } from '@/lib/api/evaluation-results';

interface EvaluationJobResultsProps {
  tenantId: string;
  projectId: string;
  jobConfig: EvaluationJobConfig;
  results: EvaluationResult[];
}

export function EvaluationJobResults({
  tenantId,
  projectId,
  jobConfig,
  results,
}: EvaluationJobResultsProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-2">Job Configuration</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">ID: </span>
            <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono">
              {jobConfig.id}
            </code>
          </div>
          <div>
            <span className="text-muted-foreground">Created: </span>
            {formatDateTimeTable(jobConfig.createdAt)}
          </div>
          <div>
            <span className="text-muted-foreground">Updated: </span>
            {formatDateTimeTable(jobConfig.updatedAt)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Evaluation Results ({results.length})</h3>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No evaluation results yet. The job may still be running.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow noHover>
                <TableHead>Conversation ID</TableHead>
                <TableHead>Evaluator ID</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.id} noHover>
                  <TableCell>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/traces/conversations/${result.conversationId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <code className="font-mono">{result.conversationId}</code>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono">
                      {result.evaluatorId}
                    </code>
                  </TableCell>
                  <TableCell>
                    {result.output ? (
                      <ExpandableJsonEditor
                        name={`result-${result.id}`}
                        value={JSON.stringify(result.output, null, 2)}
                        onChange={() => {}}
                        label="Output"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">No output</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeTable(result.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
